/**
 * Calendar provider abstraction layer.
 *
 * Every external calendar integration (Google, Microsoft, CalDAV, etc.)
 * implements the CalendarProvider interface. Providers are stateless;
 * tokens are passed as arguments to every operation so that a single
 * provider instance can serve many users without context bleed.
 *
 * Webhook subscription methods are intentionally NOT part of this
 * interface in Phase 2. They will be added by a separate interface
 * extension once Redis and BullMQ are wired (currently planned for
 * Phase 2.5 or folded into Phase 4).
 */

/**
 * Identifier of a supported calendar provider. New providers extend
 * this union; the values match the `provider` column stored in
 * `calendar_connections`.
 */
export type CalendarProviderId = "google";
// future: | "microsoft" | "apple" | "caldav"

/**
 * Encrypted-at-rest tokens for a connected calendar account. In the
 * database these are stored as `v1:base64nonce:base64ciphertext`
 * strings; the encryption helpers shipped in Phase 2b decrypt them
 * before passing them to provider methods.
 */
export interface CalendarTokens {
  accessToken: string;
  refreshToken: string;
  /** Absolute expiry of the access token. */
  expiresAt: Date;
}

/**
 * A single calendar belonging to a connected account (e.g. a user's
 * primary calendar, a shared team calendar, a holiday calendar).
 */
export interface ConnectedCalendar {
  /** Provider-specific calendar identifier. */
  id: string;
  name: string;
  primary: boolean;
  /** IANA timezone string, e.g. "America/Los_Angeles". */
  timezone: string;
  /**
   * The connected account's level of access to this calendar.
   * Booking flows require at least "writer" on the target calendar.
   */
  accessRole: "owner" | "writer" | "reader" | "freeBusyReader";
}

/** A busy time block returned by a freebusy query. */
export interface BusyBlock {
  start: Date;
  end: Date;
}

/** A calendar event returned by read operations. */
export interface CalendarEvent {
  /** Provider-specific event identifier. */
  id: string;
  summary: string;
  description?: string;
  start: Date;
  end: Date;
  attendees: CalendarAttendee[];
  /** Set when the event has an attached conferencing link. */
  conferenceData?: {
    meetingUrl: string;
    provider: "google_meet";
  };
}

export interface CalendarAttendee {
  email: string;
  displayName?: string;
  responseStatus?: "accepted" | "declined" | "tentative" | "needsAction";
}

/** Input for creating a new event on a connected calendar. */
export interface CreateEventInput {
  calendarId: string;
  summary: string;
  description?: string;
  start: Date;
  end: Date;
  attendees: { email: string; displayName?: string }[];
  /** IANA timezone string for the event. */
  timezone: string;
  /** When true, request a conferencing link be created and attached. */
  withConference?: boolean;
}

/** Input for updating an existing event. Omitted fields are not changed. */
export interface UpdateEventInput {
  calendarId: string;
  eventId: string;
  summary?: string;
  description?: string;
  start?: Date;
  end?: Date;
  attendees?: { email: string; displayName?: string }[];
}

/** Result of exchanging an OAuth authorization code for tokens. */
export interface AuthorizationResult {
  tokens: CalendarTokens;
  /**
   * Stable opaque identifier of the connected account from the
   * provider (Google: the `sub` claim from the ID token).
   */
  externalAccountId: string;
  /** Email address of the connected account, for display purposes. */
  externalAccountEmail: string;
  /** Scopes actually granted by the user. May be a subset of requested. */
  scopes: string[];
}

/**
 * The calendar provider contract. Implementations live in
 * `src/lib/calendar/providers/<id>.ts` and are registered via
 * `registerProvider` in `src/lib/calendar/providers/index.ts`.
 *
 * All methods that operate on a connected calendar take a
 * `CalendarTokens` object as input. Implementations MUST NOT cache
 * tokens on the provider instance.
 */
export interface CalendarProvider {
  readonly id: CalendarProviderId;

  /**
   * Build the authorization URL the user is redirected to to grant
   * calendar access. `state` should be an opaque, CSRF-resistant
   * value supplied by the caller and validated on callback.
   */
  buildAuthorizationUrl(args: { state: string; redirectUri: string }): string;

  /**
   * Exchange an authorization code (received at the callback URL)
   * for tokens and account metadata. Throws if the code is invalid
   * or the exchange fails.
   */
  exchangeCode(args: {
    code: string;
    redirectUri: string;
  }): Promise<AuthorizationResult>;

  /**
   * Use the refresh token to obtain a new access token. Returns the
   * full token set; some providers also rotate the refresh token, so
   * callers should always persist the returned tokens. Throws if the
   * refresh token has been revoked; callers should delete the
   * connection row on this error and prompt the user to reconnect.
   */
  refreshAccessToken(args: { refreshToken: string }): Promise<CalendarTokens>;

  /**
   * Revoke the connection at the provider, so the user no longer
   * grants this app access. Best-effort; if revocation fails (e.g.
   * the token is already invalid) the caller should still delete the
   * local connection row.
   */
  revoke(args: { refreshToken: string }): Promise<void>;

  /** List the calendars accessible by the connected account. */
  listCalendars(args: { tokens: CalendarTokens }): Promise<ConnectedCalendar[]>;

  /**
   * Return busy time blocks for the named calendars between
   * `timeMin` and `timeMax`. The returned map is keyed by calendar
   * id; calendars with no busy blocks return an empty array.
   */
  getFreeBusy(args: {
    tokens: CalendarTokens;
    calendarIds: string[];
    timeMin: Date;
    timeMax: Date;
  }): Promise<Map<string, BusyBlock[]>>;

  createEvent(args: {
    tokens: CalendarTokens;
    input: CreateEventInput;
  }): Promise<CalendarEvent>;

  updateEvent(args: {
    tokens: CalendarTokens;
    input: UpdateEventInput;
  }): Promise<CalendarEvent>;

  deleteEvent(args: {
    tokens: CalendarTokens;
    calendarId: string;
    eventId: string;
  }): Promise<void>;
}
