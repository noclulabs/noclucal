import { google, type calendar_v3 } from "googleapis";
import { randomUUID } from "node:crypto";
import type {
  AuthorizationResult,
  BusyBlock,
  CalendarEvent,
  CalendarProvider,
  CalendarTokens,
  ConnectedCalendar,
} from "../types";

/**
 * Google Calendar provider. Implements the stateless `CalendarProvider`
 * contract over the official `googleapis` SDK.
 *
 * Client credentials (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) are
 * sourced lazily from the environment, matching the pattern in
 * `src/lib/calendar/crypto.ts`. Tokens are passed as arguments to every
 * method, never held on the provider instance.
 */

const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
] as const;

function loadClientId(): string {
  const v = process.env.GOOGLE_CLIENT_ID;
  if (!v) {
    throw new Error(
      "GOOGLE_CLIENT_ID is not set. Configure the OAuth client in Google Cloud Console and add the value to .env.local (or the deploy environment).",
    );
  }
  return v;
}

function loadClientSecret(): string {
  const v = process.env.GOOGLE_CLIENT_SECRET;
  if (!v) {
    throw new Error(
      "GOOGLE_CLIENT_SECRET is not set. Configure the OAuth client in Google Cloud Console and add the value to .env.local (or the deploy environment).",
    );
  }
  return v;
}

function createOAuthClient(redirectUri: string) {
  return new google.auth.OAuth2(loadClientId(), loadClientSecret(), redirectUri);
}

function createOAuthClientWithCredentials(tokens: CalendarTokens) {
  // For data-plane operations (no redirect URI needed), construct the client
  // without a redirect URI and set credentials directly.
  const client = new google.auth.OAuth2(loadClientId(), loadClientSecret());
  client.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expiry_date: tokens.expiresAt.getTime(),
  });
  return client;
}

function mapGoogleAccessRole(
  raw: string | null | undefined,
): ConnectedCalendar["accessRole"] {
  switch (raw) {
    case "owner":
    case "writer":
    case "reader":
    case "freeBusyReader":
      return raw;
    default:
      // Google's enum is closed; anything else is unexpected. Default to
      // the most restrictive role so callers do not accidentally treat
      // unknown access as writable.
      return "freeBusyReader";
  }
}

function mapCalendarEvent(ev: calendar_v3.Schema$Event): CalendarEvent {
  if (!ev.id) {
    throw new Error("Google returned an event with no id");
  }
  const start = ev.start?.dateTime ?? ev.start?.date;
  const end = ev.end?.dateTime ?? ev.end?.date;
  if (!start || !end) {
    throw new Error(`Google event ${ev.id} is missing start or end`);
  }
  const conf =
    ev.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")
      ?.uri ?? undefined;
  return {
    id: ev.id,
    summary: ev.summary ?? "",
    description: ev.description ?? undefined,
    start: new Date(start),
    end: new Date(end),
    attendees: (ev.attendees ?? []).map((a) => ({
      email: a.email ?? "",
      displayName: a.displayName ?? undefined,
      responseStatus: a.responseStatus as CalendarEvent["attendees"][number]["responseStatus"],
    })),
    conferenceData: conf
      ? { meetingUrl: conf, provider: "google_meet" }
      : undefined,
  };
}

export const googleCalendarProvider: CalendarProvider = {
  id: "google",

  buildAuthorizationUrl({ state, redirectUri }) {
    const client = createOAuthClient(redirectUri);
    return client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [...SCOPES],
      state,
      include_granted_scopes: true,
    });
  },

  async exchangeCode({ code, redirectUri }): Promise<AuthorizationResult> {
    const client = createOAuthClient(redirectUri);
    const { tokens } = await client.getToken(code);
    if (!tokens.access_token || !tokens.refresh_token || !tokens.expiry_date) {
      throw new Error(
        "Google token exchange did not return a complete token set (access_token, refresh_token, expiry_date all required)",
      );
    }
    if (!tokens.id_token) {
      throw new Error(
        "Google token exchange did not return an id_token; ensure 'openid' is in the requested scopes",
      );
    }
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: loadClientId(),
    });
    const payload = ticket.getPayload();
    if (!payload?.sub) {
      throw new Error("Google id_token payload is missing 'sub' (account identifier)");
    }
    if (!payload.email) {
      throw new Error(
        "Google id_token payload is missing 'email'; ensure 'email' is in the requested scopes",
      );
    }
    return {
      tokens: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(tokens.expiry_date),
      },
      externalAccountId: payload.sub,
      externalAccountEmail: payload.email,
      scopes: (tokens.scope ?? "").split(" ").filter(Boolean),
    };
  },

  async refreshAccessToken({ refreshToken }): Promise<CalendarTokens> {
    const client = new google.auth.OAuth2(loadClientId(), loadClientSecret());
    client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await client.refreshAccessToken();
    if (!credentials.access_token || !credentials.expiry_date) {
      throw new Error("Google refresh did not return an access_token + expiry_date");
    }
    return {
      accessToken: credentials.access_token,
      // Google may rotate the refresh token. If it did, use the new one;
      // otherwise the caller's refresh token remains valid.
      refreshToken: credentials.refresh_token ?? refreshToken,
      expiresAt: new Date(credentials.expiry_date),
    };
  },

  async revoke({ refreshToken }): Promise<void> {
    const client = new google.auth.OAuth2(loadClientId(), loadClientSecret());
    await client.revokeToken(refreshToken);
  },

  async listCalendars({ tokens }): Promise<ConnectedCalendar[]> {
    const client = createOAuthClientWithCredentials(tokens);
    const calendar = google.calendar({ version: "v3", auth: client });
    const res = await calendar.calendarList.list();
    return (res.data.items ?? []).map((c) => ({
      id: c.id ?? "",
      name: c.summary ?? "",
      primary: c.primary === true,
      timezone: c.timeZone ?? "UTC",
      accessRole: mapGoogleAccessRole(c.accessRole),
    }));
  },

  async getFreeBusy({
    tokens,
    calendarIds,
    timeMin,
    timeMax,
  }): Promise<Map<string, BusyBlock[]>> {
    const client = createOAuthClientWithCredentials(tokens);
    const calendar = google.calendar({ version: "v3", auth: client });
    const res = await calendar.freebusy.query({
      requestBody: {
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: calendarIds.map((id) => ({ id })),
      },
    });
    const result = new Map<string, BusyBlock[]>();
    for (const id of calendarIds) {
      const entry = res.data.calendars?.[id];
      const busy = (entry?.busy ?? [])
        .map((b) =>
          b.start && b.end
            ? { start: new Date(b.start), end: new Date(b.end) }
            : null,
        )
        .filter((b): b is BusyBlock => b !== null);
      result.set(id, busy);
    }
    return result;
  },

  async createEvent({ tokens, input }): Promise<CalendarEvent> {
    const client = createOAuthClientWithCredentials(tokens);
    const calendar = google.calendar({ version: "v3", auth: client });
    const requestBody: calendar_v3.Schema$Event = {
      summary: input.summary,
      description: input.description,
      start: { dateTime: input.start.toISOString(), timeZone: input.timezone },
      end: { dateTime: input.end.toISOString(), timeZone: input.timezone },
      attendees: input.attendees.map((a) => ({
        email: a.email,
        displayName: a.displayName,
      })),
    };
    if (input.withConference) {
      requestBody.conferenceData = {
        createRequest: {
          requestId: randomUUID(),
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      };
    }
    const res = await calendar.events.insert({
      calendarId: input.calendarId,
      conferenceDataVersion: input.withConference ? 1 : 0,
      requestBody,
    });
    if (!res.data) {
      throw new Error("Google events.insert returned no data");
    }
    return mapCalendarEvent(res.data);
  },

  async updateEvent({ tokens, input }): Promise<CalendarEvent> {
    const client = createOAuthClientWithCredentials(tokens);
    const calendar = google.calendar({ version: "v3", auth: client });
    const requestBody: calendar_v3.Schema$Event = {};
    if (input.summary !== undefined) requestBody.summary = input.summary;
    if (input.description !== undefined) requestBody.description = input.description;
    if (input.start !== undefined) {
      requestBody.start = { dateTime: input.start.toISOString() };
    }
    if (input.end !== undefined) {
      requestBody.end = { dateTime: input.end.toISOString() };
    }
    if (input.attendees !== undefined) {
      requestBody.attendees = input.attendees.map((a) => ({
        email: a.email,
        displayName: a.displayName,
      }));
    }
    const res = await calendar.events.patch({
      calendarId: input.calendarId,
      eventId: input.eventId,
      requestBody,
    });
    if (!res.data) {
      throw new Error("Google events.patch returned no data");
    }
    return mapCalendarEvent(res.data);
  },

  async deleteEvent({ tokens, calendarId, eventId }): Promise<void> {
    const client = createOAuthClientWithCredentials(tokens);
    const calendar = google.calendar({ version: "v3", auth: client });
    await calendar.events.delete({ calendarId, eventId });
  },
};
