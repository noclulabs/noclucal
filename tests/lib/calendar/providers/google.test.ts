import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CalendarTokens } from "@/lib/calendar/types";

// All mock functions are declared here so individual tests can configure
// their return values via .mockReturnValue / .mockResolvedValue / .mockRejectedValue.
const mockGenerateAuthUrl = vi.fn();
const mockGetToken = vi.fn();
const mockVerifyIdToken = vi.fn();
const mockSetCredentials = vi.fn();
const mockRefreshAccessToken = vi.fn();
const mockRevokeToken = vi.fn();

const mockCalendarListList = vi.fn();
const mockFreebusyQuery = vi.fn();
const mockEventsInsert = vi.fn();
const mockEventsPatch = vi.fn();
const mockEventsDelete = vi.fn();

vi.mock("googleapis", () => {
  // Regular function expressions (not arrow functions) so the SDK's
  // `new google.auth.OAuth2(...)` call works; arrow functions cannot be
  // used as constructors.
  const OAuth2 = vi.fn().mockImplementation(function () {
    return {
      generateAuthUrl: mockGenerateAuthUrl,
      getToken: mockGetToken,
      verifyIdToken: mockVerifyIdToken,
      setCredentials: mockSetCredentials,
      refreshAccessToken: mockRefreshAccessToken,
      revokeToken: mockRevokeToken,
    };
  });
  const calendar = vi.fn().mockImplementation(function () {
    return {
      calendarList: { list: mockCalendarListList },
      freebusy: { query: mockFreebusyQuery },
      events: {
        insert: mockEventsInsert,
        patch: mockEventsPatch,
        delete: mockEventsDelete,
      },
    };
  });
  return { google: { auth: { OAuth2 }, calendar } };
});

// Import the provider AFTER vi.mock so the mock is in place.
import { googleCalendarProvider } from "@/lib/calendar/providers/google";

beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  vi.clearAllMocks();
});

// Shared token fixture for data-plane operations.
const TOKENS: CalendarTokens = {
  accessToken: "ya29.test-access-token",
  refreshToken: "1//test-refresh-token",
  expiresAt: new Date("2026-05-29T12:00:00.000Z"),
};

// Build a fully-populated token-exchange response for the happy path.
// Token fields are optional so individual cases can `delete` them to
// exercise the missing-field error paths.
interface ExchangeTokens {
  access_token?: string;
  refresh_token?: string;
  expiry_date?: number;
  id_token?: string;
  scope?: string;
}

function validExchangeResponse(): { tokens: ExchangeTokens } {
  return {
    tokens: {
      access_token: "ya29.exchanged-access-token",
      refresh_token: "1//exchanged-refresh-token",
      expiry_date: 1_900_000_000_000,
      id_token: "header.payload.signature",
      scope:
        "openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly",
    },
  };
}

function verifiedTicket(payload: Record<string, unknown>) {
  return { getPayload: () => payload };
}

describe("googleCalendarProvider", () => {
  describe("buildAuthorizationUrl", () => {
    it("returns the URL produced by generateAuthUrl", () => {
      mockGenerateAuthUrl.mockReturnValue("https://accounts.google.com/o/oauth2/auth?x=1");
      const url = googleCalendarProvider.buildAuthorizationUrl({
        state: "opaque-state",
        redirectUri: "https://cal.noclulabs.com/api/calendar/google/callback",
      });
      expect(url).toBe("https://accounts.google.com/o/oauth2/auth?x=1");
    });

    it("passes state through", () => {
      mockGenerateAuthUrl.mockReturnValue("https://example.test/auth");
      googleCalendarProvider.buildAuthorizationUrl({
        state: "csrf-token-abc",
        redirectUri: "https://cal.noclulabs.com/api/calendar/google/callback",
      });
      expect(mockGenerateAuthUrl).toHaveBeenCalledWith(
        expect.objectContaining({ state: "csrf-token-abc" }),
      );
    });

    it("sets access_type offline, prompt consent, include_granted_scopes true", () => {
      mockGenerateAuthUrl.mockReturnValue("https://example.test/auth");
      googleCalendarProvider.buildAuthorizationUrl({
        state: "s",
        redirectUri: "https://cal.noclulabs.com/api/calendar/google/callback",
      });
      expect(mockGenerateAuthUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          access_type: "offline",
          prompt: "consent",
          include_granted_scopes: true,
        }),
      );
    });

    it("requests exactly the four expected scopes", () => {
      mockGenerateAuthUrl.mockReturnValue("https://example.test/auth");
      googleCalendarProvider.buildAuthorizationUrl({
        state: "s",
        redirectUri: "https://cal.noclulabs.com/api/calendar/google/callback",
      });
      const arg = mockGenerateAuthUrl.mock.calls[0][0];
      expect(arg.scope).toEqual([
        "openid",
        "email",
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/calendar.readonly",
      ]);
    });

    it("throws when GOOGLE_CLIENT_ID is unset", () => {
      delete process.env.GOOGLE_CLIENT_ID;
      expect(() =>
        googleCalendarProvider.buildAuthorizationUrl({
          state: "s",
          redirectUri: "https://cal.noclulabs.com/api/calendar/google/callback",
        }),
      ).toThrow(/GOOGLE_CLIENT_ID/);
    });

    it("throws when GOOGLE_CLIENT_SECRET is unset", () => {
      delete process.env.GOOGLE_CLIENT_SECRET;
      expect(() =>
        googleCalendarProvider.buildAuthorizationUrl({
          state: "s",
          redirectUri: "https://cal.noclulabs.com/api/calendar/google/callback",
        }),
      ).toThrow(/GOOGLE_CLIENT_SECRET/);
    });
  });

  describe("exchangeCode", () => {
    const REDIRECT = "https://cal.noclulabs.com/api/calendar/google/callback";

    it("calls getToken with the provided code", async () => {
      mockGetToken.mockResolvedValue(validExchangeResponse());
      mockVerifyIdToken.mockResolvedValue(
        verifiedTicket({ sub: "google-sub-123", email: "user@example.com" }),
      );
      await googleCalendarProvider.exchangeCode({
        code: "auth-code-xyz",
        redirectUri: REDIRECT,
      });
      expect(mockGetToken).toHaveBeenCalledWith("auth-code-xyz");
    });

    it("verifies the id_token with audience equal to the client id", async () => {
      mockGetToken.mockResolvedValue(validExchangeResponse());
      mockVerifyIdToken.mockResolvedValue(
        verifiedTicket({ sub: "google-sub-123", email: "user@example.com" }),
      );
      await googleCalendarProvider.exchangeCode({
        code: "auth-code-xyz",
        redirectUri: REDIRECT,
      });
      expect(mockVerifyIdToken).toHaveBeenCalledWith({
        idToken: "header.payload.signature",
        audience: "test-client-id",
      });
    });

    it("returns externalAccountId equal to payload.sub", async () => {
      mockGetToken.mockResolvedValue(validExchangeResponse());
      mockVerifyIdToken.mockResolvedValue(
        verifiedTicket({ sub: "google-sub-123", email: "user@example.com" }),
      );
      const result = await googleCalendarProvider.exchangeCode({
        code: "c",
        redirectUri: REDIRECT,
      });
      expect(result.externalAccountId).toBe("google-sub-123");
    });

    it("returns externalAccountEmail equal to payload.email", async () => {
      mockGetToken.mockResolvedValue(validExchangeResponse());
      mockVerifyIdToken.mockResolvedValue(
        verifiedTicket({ sub: "google-sub-123", email: "user@example.com" }),
      );
      const result = await googleCalendarProvider.exchangeCode({
        code: "c",
        redirectUri: REDIRECT,
      });
      expect(result.externalAccountEmail).toBe("user@example.com");
    });

    it("returns expiresAt as a Date matching the expiry_date number", async () => {
      mockGetToken.mockResolvedValue(validExchangeResponse());
      mockVerifyIdToken.mockResolvedValue(
        verifiedTicket({ sub: "google-sub-123", email: "user@example.com" }),
      );
      const result = await googleCalendarProvider.exchangeCode({
        code: "c",
        redirectUri: REDIRECT,
      });
      expect(result.tokens.expiresAt).toBeInstanceOf(Date);
      expect(result.tokens.expiresAt.getTime()).toBe(1_900_000_000_000);
    });

    it("returns scopes split from the space-separated scope string", async () => {
      mockGetToken.mockResolvedValue(validExchangeResponse());
      mockVerifyIdToken.mockResolvedValue(
        verifiedTicket({ sub: "google-sub-123", email: "user@example.com" }),
      );
      const result = await googleCalendarProvider.exchangeCode({
        code: "c",
        redirectUri: REDIRECT,
      });
      expect(result.scopes).toEqual([
        "openid",
        "email",
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/calendar.readonly",
      ]);
    });

    it("throws when access_token is missing", async () => {
      const r = validExchangeResponse();
      delete r.tokens.access_token;
      mockGetToken.mockResolvedValue(r);
      await expect(
        googleCalendarProvider.exchangeCode({ code: "c", redirectUri: REDIRECT }),
      ).rejects.toThrow(/complete token set/);
    });

    it("throws when refresh_token is missing", async () => {
      const r = validExchangeResponse();
      delete r.tokens.refresh_token;
      mockGetToken.mockResolvedValue(r);
      await expect(
        googleCalendarProvider.exchangeCode({ code: "c", redirectUri: REDIRECT }),
      ).rejects.toThrow(/complete token set/);
    });

    it("throws when expiry_date is missing", async () => {
      const r = validExchangeResponse();
      delete r.tokens.expiry_date;
      mockGetToken.mockResolvedValue(r);
      await expect(
        googleCalendarProvider.exchangeCode({ code: "c", redirectUri: REDIRECT }),
      ).rejects.toThrow(/complete token set/);
    });

    it("throws when id_token is missing", async () => {
      const r = validExchangeResponse();
      delete r.tokens.id_token;
      mockGetToken.mockResolvedValue(r);
      await expect(
        googleCalendarProvider.exchangeCode({ code: "c", redirectUri: REDIRECT }),
      ).rejects.toThrow(/id_token/);
    });

    it("throws when the verified payload is missing sub", async () => {
      mockGetToken.mockResolvedValue(validExchangeResponse());
      mockVerifyIdToken.mockResolvedValue(
        verifiedTicket({ email: "user@example.com" }),
      );
      await expect(
        googleCalendarProvider.exchangeCode({ code: "c", redirectUri: REDIRECT }),
      ).rejects.toThrow(/sub/);
    });

    it("throws when the verified payload is missing email", async () => {
      mockGetToken.mockResolvedValue(validExchangeResponse());
      mockVerifyIdToken.mockResolvedValue(
        verifiedTicket({ sub: "google-sub-123" }),
      );
      await expect(
        googleCalendarProvider.exchangeCode({ code: "c", redirectUri: REDIRECT }),
      ).rejects.toThrow(/email/);
    });
  });

  describe("refreshAccessToken", () => {
    it("sets credentials with the provided refresh token before refreshing", async () => {
      mockRefreshAccessToken.mockResolvedValue({
        credentials: {
          access_token: "ya29.new-access",
          expiry_date: 1_900_000_100_000,
        },
      });
      await googleCalendarProvider.refreshAccessToken({
        refreshToken: "1//caller-refresh",
      });
      expect(mockSetCredentials).toHaveBeenCalledWith({
        refresh_token: "1//caller-refresh",
      });
    });

    it("returns the new access token and expiry from Google", async () => {
      mockRefreshAccessToken.mockResolvedValue({
        credentials: {
          access_token: "ya29.new-access",
          expiry_date: 1_900_000_100_000,
        },
      });
      const result = await googleCalendarProvider.refreshAccessToken({
        refreshToken: "1//caller-refresh",
      });
      expect(result.accessToken).toBe("ya29.new-access");
      expect(result.expiresAt.getTime()).toBe(1_900_000_100_000);
    });

    it("uses the rotated refresh token when Google returns a new one", async () => {
      mockRefreshAccessToken.mockResolvedValue({
        credentials: {
          access_token: "ya29.new-access",
          refresh_token: "1//rotated-refresh",
          expiry_date: 1_900_000_100_000,
        },
      });
      const result = await googleCalendarProvider.refreshAccessToken({
        refreshToken: "1//caller-refresh",
      });
      expect(result.refreshToken).toBe("1//rotated-refresh");
    });

    it("preserves the caller's refresh token when Google does not rotate", async () => {
      mockRefreshAccessToken.mockResolvedValue({
        credentials: {
          access_token: "ya29.new-access",
          expiry_date: 1_900_000_100_000,
        },
      });
      const result = await googleCalendarProvider.refreshAccessToken({
        refreshToken: "1//caller-refresh",
      });
      expect(result.refreshToken).toBe("1//caller-refresh");
    });

    it("throws when the refresh response has no access_token", async () => {
      mockRefreshAccessToken.mockResolvedValue({
        credentials: { expiry_date: 1_900_000_100_000 },
      });
      await expect(
        googleCalendarProvider.refreshAccessToken({ refreshToken: "r" }),
      ).rejects.toThrow(/access_token/);
    });

    it("throws when the refresh response has no expiry_date", async () => {
      mockRefreshAccessToken.mockResolvedValue({
        credentials: { access_token: "ya29.new-access" },
      });
      await expect(
        googleCalendarProvider.refreshAccessToken({ refreshToken: "r" }),
      ).rejects.toThrow(/expiry_date/);
    });
  });

  describe("revoke", () => {
    it("calls revokeToken with the refresh token", async () => {
      mockRevokeToken.mockResolvedValue(undefined);
      await googleCalendarProvider.revoke({ refreshToken: "1//to-revoke" });
      expect(mockRevokeToken).toHaveBeenCalledWith("1//to-revoke");
    });
  });

  describe("listCalendars", () => {
    it("calls calendarList.list", async () => {
      mockCalendarListList.mockResolvedValue({ data: { items: [] } });
      await googleCalendarProvider.listCalendars({ tokens: TOKENS });
      expect(mockCalendarListList).toHaveBeenCalled();
    });

    it("maps response items to ConnectedCalendar with correct field mapping", async () => {
      mockCalendarListList.mockResolvedValue({
        data: {
          items: [
            {
              id: "primary@example.com",
              summary: "Personal",
              primary: true,
              timeZone: "America/Los_Angeles",
              accessRole: "owner",
            },
            {
              id: "team@group.calendar.google.com",
              summary: "Team",
              timeZone: "Europe/London",
              accessRole: "writer",
            },
          ],
        },
      });
      const result = await googleCalendarProvider.listCalendars({ tokens: TOKENS });
      expect(result).toEqual([
        {
          id: "primary@example.com",
          name: "Personal",
          primary: true,
          timezone: "America/Los_Angeles",
          accessRole: "owner",
        },
        {
          id: "team@group.calendar.google.com",
          name: "Team",
          primary: false,
          timezone: "Europe/London",
          accessRole: "writer",
        },
      ]);
    });

    it("maps an unknown accessRole to freeBusyReader", async () => {
      mockCalendarListList.mockResolvedValue({
        data: {
          items: [
            {
              id: "weird@example.com",
              summary: "Weird",
              timeZone: "UTC",
              accessRole: "somethingUnexpected",
            },
          ],
        },
      });
      const result = await googleCalendarProvider.listCalendars({ tokens: TOKENS });
      expect(result[0].accessRole).toBe("freeBusyReader");
    });

    it("returns an empty array when Google returns no items", async () => {
      mockCalendarListList.mockResolvedValue({ data: {} });
      const result = await googleCalendarProvider.listCalendars({ tokens: TOKENS });
      expect(result).toEqual([]);
    });
  });

  describe("getFreeBusy", () => {
    const timeMin = new Date("2026-06-01T00:00:00.000Z");
    const timeMax = new Date("2026-06-02T00:00:00.000Z");

    it("calls freebusy.query with ISO timeMin/timeMax and items from calendarIds", async () => {
      mockFreebusyQuery.mockResolvedValue({ data: { calendars: {} } });
      await googleCalendarProvider.getFreeBusy({
        tokens: TOKENS,
        calendarIds: ["a@example.com", "b@example.com"],
        timeMin,
        timeMax,
      });
      expect(mockFreebusyQuery).toHaveBeenCalledWith({
        requestBody: {
          timeMin: "2026-06-01T00:00:00.000Z",
          timeMax: "2026-06-02T00:00:00.000Z",
          items: [{ id: "a@example.com" }, { id: "b@example.com" }],
        },
      });
    });

    it("returns a Map keyed by calendar id with busy blocks as Dates", async () => {
      mockFreebusyQuery.mockResolvedValue({
        data: {
          calendars: {
            "a@example.com": {
              busy: [
                {
                  start: "2026-06-01T09:00:00.000Z",
                  end: "2026-06-01T10:00:00.000Z",
                },
              ],
            },
          },
        },
      });
      const result = await googleCalendarProvider.getFreeBusy({
        tokens: TOKENS,
        calendarIds: ["a@example.com"],
        timeMin,
        timeMax,
      });
      const busy = result.get("a@example.com");
      expect(busy).toHaveLength(1);
      expect(busy?.[0].start).toBeInstanceOf(Date);
      expect(busy?.[0].start.toISOString()).toBe("2026-06-01T09:00:00.000Z");
      expect(busy?.[0].end.toISOString()).toBe("2026-06-01T10:00:00.000Z");
    });

    it("returns empty arrays for calendars Google reports no busy blocks for", async () => {
      mockFreebusyQuery.mockResolvedValue({
        data: { calendars: { "a@example.com": { busy: [] } } },
      });
      const result = await googleCalendarProvider.getFreeBusy({
        tokens: TOKENS,
        calendarIds: ["a@example.com", "b@example.com"],
        timeMin,
        timeMax,
      });
      expect(result.get("a@example.com")).toEqual([]);
      expect(result.get("b@example.com")).toEqual([]);
    });
  });

  describe("createEvent", () => {
    const baseInput = {
      calendarId: "primary@example.com",
      summary: "Intro call",
      description: "Thirty minute intro",
      start: new Date("2026-06-10T15:00:00.000Z"),
      end: new Date("2026-06-10T15:30:00.000Z"),
      attendees: [{ email: "guest@example.com", displayName: "Guest" }],
      timezone: "America/New_York",
    };

    function insertedEvent() {
      return {
        data: {
          id: "evt-created-1",
          summary: "Intro call",
          start: { dateTime: "2026-06-10T15:00:00.000Z" },
          end: { dateTime: "2026-06-10T15:30:00.000Z" },
          attendees: [{ email: "guest@example.com", displayName: "Guest" }],
        },
      };
    }

    it("calls events.insert with the calendarId", async () => {
      mockEventsInsert.mockResolvedValue(insertedEvent());
      await googleCalendarProvider.createEvent({ tokens: TOKENS, input: baseInput });
      expect(mockEventsInsert).toHaveBeenCalledWith(
        expect.objectContaining({ calendarId: "primary@example.com" }),
      );
    });

    it("maps start/end Dates to ISO dateTime strings with the provided timezone", async () => {
      mockEventsInsert.mockResolvedValue(insertedEvent());
      await googleCalendarProvider.createEvent({ tokens: TOKENS, input: baseInput });
      const arg = mockEventsInsert.mock.calls[0][0];
      expect(arg.requestBody.start).toEqual({
        dateTime: "2026-06-10T15:00:00.000Z",
        timeZone: "America/New_York",
      });
      expect(arg.requestBody.end).toEqual({
        dateTime: "2026-06-10T15:30:00.000Z",
        timeZone: "America/New_York",
      });
    });

    it("adds conferenceData and conferenceDataVersion 1 when withConference is true", async () => {
      mockEventsInsert.mockResolvedValue({
        data: {
          ...insertedEvent().data,
          conferenceData: {
            entryPoints: [
              { entryPointType: "video", uri: "https://meet.google.com/abc-defg-hij" },
            ],
          },
        },
      });
      await googleCalendarProvider.createEvent({
        tokens: TOKENS,
        input: { ...baseInput, withConference: true },
      });
      const arg = mockEventsInsert.mock.calls[0][0];
      expect(arg.conferenceDataVersion).toBe(1);
      expect(arg.requestBody.conferenceData.createRequest.conferenceSolutionKey).toEqual(
        { type: "hangoutsMeet" },
      );
      expect(typeof arg.requestBody.conferenceData.createRequest.requestId).toBe(
        "string",
      );
      expect(
        arg.requestBody.conferenceData.createRequest.requestId.length,
      ).toBeGreaterThan(0);
    });

    it("omits conferenceData and passes conferenceDataVersion 0 when withConference is falsy", async () => {
      mockEventsInsert.mockResolvedValue(insertedEvent());
      await googleCalendarProvider.createEvent({ tokens: TOKENS, input: baseInput });
      const arg = mockEventsInsert.mock.calls[0][0];
      expect(arg.conferenceDataVersion).toBe(0);
      expect(arg.requestBody.conferenceData).toBeUndefined();
    });

    it("returns the mapped CalendarEvent", async () => {
      mockEventsInsert.mockResolvedValue(insertedEvent());
      const result = await googleCalendarProvider.createEvent({
        tokens: TOKENS,
        input: baseInput,
      });
      expect(result).toEqual({
        id: "evt-created-1",
        summary: "Intro call",
        description: undefined,
        start: new Date("2026-06-10T15:00:00.000Z"),
        end: new Date("2026-06-10T15:30:00.000Z"),
        attendees: [
          {
            email: "guest@example.com",
            displayName: "Guest",
            responseStatus: undefined,
          },
        ],
        conferenceData: undefined,
      });
    });
  });

  describe("updateEvent", () => {
    function patchedEvent() {
      return {
        data: {
          id: "evt-patch-1",
          summary: "Updated title",
          start: { dateTime: "2026-06-11T15:00:00.000Z" },
          end: { dateTime: "2026-06-11T15:30:00.000Z" },
          attendees: [],
        },
      };
    }

    it("calls events.patch with calendarId and eventId", async () => {
      mockEventsPatch.mockResolvedValue(patchedEvent());
      await googleCalendarProvider.updateEvent({
        tokens: TOKENS,
        input: {
          calendarId: "primary@example.com",
          eventId: "evt-patch-1",
          summary: "Updated title",
        },
      });
      expect(mockEventsPatch).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: "primary@example.com",
          eventId: "evt-patch-1",
        }),
      );
    });

    it("only includes fields that were provided in the input", async () => {
      mockEventsPatch.mockResolvedValue(patchedEvent());
      await googleCalendarProvider.updateEvent({
        tokens: TOKENS,
        input: {
          calendarId: "primary@example.com",
          eventId: "evt-patch-1",
          start: new Date("2026-06-11T15:00:00.000Z"),
        },
      });
      const arg = mockEventsPatch.mock.calls[0][0];
      expect(arg.requestBody).toEqual({
        start: { dateTime: "2026-06-11T15:00:00.000Z" },
      });
    });

    it("omits summary from requestBody when summary is undefined", async () => {
      mockEventsPatch.mockResolvedValue(patchedEvent());
      await googleCalendarProvider.updateEvent({
        tokens: TOKENS,
        input: {
          calendarId: "primary@example.com",
          eventId: "evt-patch-1",
          description: "new desc",
        },
      });
      const arg = mockEventsPatch.mock.calls[0][0];
      expect("summary" in arg.requestBody).toBe(false);
      expect(arg.requestBody.description).toBe("new desc");
    });

    it("returns the mapped CalendarEvent", async () => {
      mockEventsPatch.mockResolvedValue(patchedEvent());
      const result = await googleCalendarProvider.updateEvent({
        tokens: TOKENS,
        input: {
          calendarId: "primary@example.com",
          eventId: "evt-patch-1",
          summary: "Updated title",
        },
      });
      expect(result.id).toBe("evt-patch-1");
      expect(result.summary).toBe("Updated title");
      expect(result.start).toEqual(new Date("2026-06-11T15:00:00.000Z"));
    });
  });

  describe("deleteEvent", () => {
    it("calls events.delete with calendarId and eventId", async () => {
      mockEventsDelete.mockResolvedValue({});
      await googleCalendarProvider.deleteEvent({
        tokens: TOKENS,
        calendarId: "primary@example.com",
        eventId: "evt-del-1",
      });
      expect(mockEventsDelete).toHaveBeenCalledWith({
        calendarId: "primary@example.com",
        eventId: "evt-del-1",
      });
    });
  });
});
