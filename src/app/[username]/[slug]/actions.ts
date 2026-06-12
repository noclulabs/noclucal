"use server";

import { z } from "zod";
import { IANAZone } from "luxon";

import { resolvePublicEventType } from "@/lib/booking/resolve";
import {
  CalendarUnavailableError,
  NotBookableError,
  getAvailableSlots,
} from "@/lib/booking/available-slots";
import {
  BookingConflictError,
  createBooking,
  updateBookingGoogleRefs,
} from "@/lib/bookings/queries";
import { getHostSettings } from "@/lib/availability/queries";
import {
  getConnectionForUser,
  getValidTokensForConnection,
} from "@/lib/calendar/connections";
import { getProvider } from "@/lib/calendar/providers";
import {
  JOB_NAMES,
  type SendConfirmationJobPayload,
} from "@/lib/queue/constants";
import { getNotificationsQueue } from "@/lib/queue/queues";
// Side-effecting import so the default calendar-event writer's
// `getProvider("google")` (and the refresh path inside
// `getValidTokensForConnection`) resolve at runtime. Tests inject stubs and
// never reach this path.
import "@/lib/calendar/providers/register-all";

/**
 * Fallback host timezone when no `host_settings` row exists yet. Mirrors the
 * `host_settings.timezone` column default and the same constant in
 * `available-slots.ts`; used only to label the Google event.
 */
const DEFAULT_HOST_TIMEZONE = "America/Los_Angeles";

/** Upper bound on the optional invitee note, so untrusted input is bounded. */
const MAX_NOTE_LENGTH = 2000;

/**
 * Validates the untrusted invitee input. This is the first point untrusted
 * input enters a write path, so server-side validation is the gate (the client
 * form is convenience only). `startIso` / `endIso` must parse as ISO instants;
 * the authoritative slot bounds come from the live re-check, not these values.
 */
const confirmBookingSchema = z.object({
  username: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().trim().min(1, "Enter your name").max(200, "Name is too long"),
  email: z
    .string()
    .trim()
    .min(1, "Enter your email")
    .max(320, "Email is too long")
    .pipe(z.email("Enter a valid email")),
  note: z.string().max(MAX_NOTE_LENGTH, "Note is too long").optional(),
  startIso: z.iso.datetime({ message: "Invalid start time" }),
  endIso: z.iso.datetime({ message: "Invalid end time" }),
  inviteeTimezone: z
    .string()
    .min(1)
    .refine((tz) => IANAZone.isValidZone(tz), "Unknown timezone"),
});

export interface ConfirmBookingArgs {
  username: string;
  slug: string;
  /** Selected slot start, ISO UTC instant. */
  startIso: string;
  /** Selected slot end, ISO UTC instant. */
  endIso: string;
  name: string;
  email: string;
  note?: string;
  inviteeTimezone: string;
}

/** Confirmation details rendered in-place on success. */
export interface BookingConfirmation {
  eventName: string;
  hostName: string;
  /** The address the calendar invite went to, named in the confirmation copy. */
  inviteeEmail: string;
  /** Slot start, ISO UTC instant (rendered in the invitee timezone client-side). */
  startIso: string;
  endIso: string;
  inviteeTimezone: string;
  /** Present only if the Google event (and its Meet link) was created. */
  meetLink?: string;
}

/**
 * The result of a confirm attempt, as a discriminated union the client renders:
 * - `success`: the slot is claimed (the Google event is best-effort on top).
 * - `conflict`: the slot was taken between render and claim; pick another.
 * - `unavailable`: the slot is no longer offered (busy on Google or outside
 *   availability since render).
 * - `not_bookable`: the page no longer resolves to a bookable event type.
 * - `invalid`: the invitee input failed validation; `errors` is keyed by field.
 */
export type ConfirmBookingResult =
  | { status: "success"; confirmation: BookingConfirmation }
  | { status: "conflict" }
  | { status: "unavailable" }
  | { status: "not_bookable" }
  | { status: "invalid"; errors: Record<string, string> };

/** Inputs for the Google write-back, built by the action from re-resolved data. */
export interface CreateCalendarEventArgs {
  hostUserId: string;
  hostName: string;
  summary: string;
  description?: string;
  start: Date;
  end: Date;
  inviteeName: string;
  inviteeEmail: string;
}

export interface CreatedCalendarEvent {
  eventId: string;
  htmlLink?: string;
  meetLink?: string;
}

/** The injectable Google write-back. Tests stub it; the default hits Google. */
export type CreateCalendarEvent = (
  args: CreateCalendarEventArgs,
) => Promise<CreatedCalendarEvent>;

/** The injectable confirmation-email enqueue. Tests stub it; the default
 *  enqueues a `send-confirmation` job on the notifications queue. */
export type EnqueueConfirmationEmail = (
  payload: SendConfirmationJobPayload,
) => Promise<void>;

export interface ConfirmBookingDeps {
  getAvailableSlots: typeof getAvailableSlots;
  createCalendarEvent: CreateCalendarEvent;
  enqueueConfirmationEmail: EnqueueConfirmationEmail;
}

/**
 * Default Google write-back: look up the host's connection, refresh tokens, and
 * insert an event with a Meet link and `sendUpdates: "all"` (so Google delivers
 * its own invite to the invitee). Throws if the host has no connection; the
 * caller treats any throw here as best-effort and keeps the confirmed booking.
 */
const defaultCreateCalendarEvent: CreateCalendarEvent = async (args) => {
  const connection = await getConnectionForUser({
    userId: args.hostUserId,
    provider: "google",
  });
  if (!connection) {
    throw new Error(
      `Host ${args.hostUserId} has no connected Google calendar; cannot create event`,
    );
  }
  const tokens = await getValidTokensForConnection(connection.id);
  const provider = getProvider("google");
  const hostSettings = await getHostSettings(args.hostUserId);
  const timezone = hostSettings?.timezone ?? DEFAULT_HOST_TIMEZONE;
  const event = await provider.createEvent({
    tokens,
    input: {
      calendarId: "primary",
      summary: args.summary,
      description: args.description,
      start: args.start,
      end: args.end,
      timezone,
      attendees: [
        { email: connection.externalAccountEmail, displayName: args.hostName },
        { email: args.inviteeEmail, displayName: args.inviteeName },
      ],
      withConference: true,
      sendUpdates: "all",
    },
  });
  return {
    eventId: event.id,
    htmlLink: event.htmlLink,
    meetLink: event.conferenceData?.meetingUrl,
  };
};

/** Default enqueue: a `send-confirmation` job on the notifications queue. The
 *  payload is self-contained (the worker sends with no database read) and the
 *  queue's default job options apply (retries with backoff, completed jobs
 *  removed). */
const defaultEnqueueConfirmationEmail: EnqueueConfirmationEmail = async (
  payload,
) => {
  await getNotificationsQueue().add(JOB_NAMES.SEND_CONFIRMATION, payload);
};

const defaultDeps: ConfirmBookingDeps = {
  getAvailableSlots,
  createCalendarEvent: defaultCreateCalendarEvent,
  enqueueConfirmationEmail: defaultEnqueueConfirmationEmail,
};

/** First Zod issue per top-level field, keyed by field name. */
function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in out)) {
      out[key] = issue.message;
    }
  }
  return out;
}

/** Always include a short detail line; prepend the invitee note when present. */
function buildDescription(
  note: string | null,
  eventName: string,
  inviteeName: string,
): string {
  const detail = `${eventName} booked through noCluCal with ${inviteeName}.`;
  return note ? `${note}\n\n${detail}` : detail;
}

/**
 * Confirm a booking from the public page. Anonymous: the invitee is not signed
 * in, so authz is by public route resolution, never a client-passed host or
 * event-type id. The operation order is load-bearing (see CALENDAR-PLAYBOOK.md
 * § Booking write flow):
 *
 * 1. Validate the invitee input.
 * 2. Re-resolve the public event type server-side.
 * 3. Live re-check that the slot is still available (catches a slot that went
 *    busy on Google or fell outside availability since render).
 * 4. Claim the slot with `createBooking`; the exclusion constraint is the
 *    authoritative taken moment. A conflict creates no Google event.
 * 5. Best-effort Google event AFTER the claim. A failure leaves the booking
 *    confirmed with null refs and still returns success; a calendar hiccup
 *    never loses a claimed slot.
 * 6. Best-effort confirmation email enqueue AFTER the claim and the Google
 *    write-back (Phase 5c). An enqueue failure is logged and swallowed; the
 *    booking outcome never depends on the notification path.
 *
 * The external calls and the enqueue are injected (`deps`) so tests run
 * without Google or Redis.
 */
export async function confirmBooking(
  args: ConfirmBookingArgs,
  deps: ConfirmBookingDeps = defaultDeps,
): Promise<ConfirmBookingResult> {
  // 1. Validate.
  const parsed = confirmBookingSchema.safeParse(args);
  if (!parsed.success) {
    return { status: "invalid", errors: fieldErrors(parsed.error) };
  }
  const { username, slug, name, email, inviteeTimezone } = parsed.data;
  const note = parsed.data.note?.trim() ? parsed.data.note.trim() : null;
  const requestedStart = new Date(parsed.data.startIso);

  // 2. Re-resolve. Unknown or disabled collapses to not bookable.
  const resolved = await resolvePublicEventType({ username, slug });
  if (!resolved) {
    return { status: "not_bookable" };
  }
  const { hostUserId, host, eventType } = resolved;
  const hostName = host.displayName ?? host.username;

  // 3. Live re-check over a narrow window covering the slot. The matched slot's
  //    own start/end are authoritative for the write (never the client values).
  const now = new Date();
  let recheck;
  try {
    recheck = await deps.getAvailableSlots({
      hostUserId,
      eventTypeId: eventType.id,
      rangeStart: requestedStart,
      rangeEnd: new Date(parsed.data.endIso),
      now,
    });
  } catch (err) {
    if (err instanceof NotBookableError) return { status: "not_bookable" };
    if (err instanceof CalendarUnavailableError) return { status: "unavailable" };
    throw err;
  }
  const slot = recheck.slots.find(
    (s) => s.start.getTime() === requestedStart.getTime(),
  );
  if (!slot) {
    return { status: "unavailable" };
  }

  // 4. Claim the slot. The exclusion constraint is the hard floor; a 23P01
  //    becomes the conflict path and creates no Google event.
  let booking;
  try {
    booking = await createBooking({
      hostUserId,
      eventTypeId: eventType.id,
      eventTypeName: eventType.name,
      durationMinutes: eventType.durationMinutes,
      inviteeName: name,
      inviteeEmail: email,
      inviteeNote: note,
      inviteeTimezone,
      startsAt: slot.start,
      endsAt: slot.end,
    });
  } catch (err) {
    if (err instanceof BookingConflictError) return { status: "conflict" };
    throw err;
  }

  // 5. Best-effort Google event AFTER the claim. A failure here is logged and
  //    swallowed: the booking stays confirmed with null refs and we still
  //    return success, because the slot is legitimately claimed.
  let meetLink: string | undefined;
  try {
    const created = await deps.createCalendarEvent({
      hostUserId,
      hostName,
      summary: `${eventType.name} with ${name}`,
      description: buildDescription(note, eventType.name, name),
      start: slot.start,
      end: slot.end,
      inviteeName: name,
      inviteeEmail: email,
    });
    await updateBookingGoogleRefs(booking.id, {
      eventId: created.eventId,
      htmlLink: created.htmlLink ?? null,
      meetLink: created.meetLink ?? null,
    });
    meetLink = created.meetLink;
  } catch (err) {
    console.error(
      `Google event creation failed for booking ${booking.id}; booking remains confirmed with null Google refs`,
      err,
    );
  }

  // 6. Best-effort confirmation email enqueue AFTER the claim and the Google
  //    write-back. The payload is self-contained from data this action already
  //    holds (the worker sends with no database read); the Meet link is absent
  //    when the write-back failed. A failure here is logged and swallowed: the
  //    booking outcome never depends on the notification path.
  try {
    await deps.enqueueConfirmationEmail({
      to: email,
      inviteeName: name,
      hostName,
      eventTypeName: eventType.name,
      startIso: slot.start.toISOString(),
      endIso: slot.end.toISOString(),
      inviteeTimezone,
      durationMinutes: eventType.durationMinutes,
      meetLink,
      inviteeNote: note ?? undefined,
    });
  } catch (err) {
    console.error(
      `Confirmation email enqueue failed for booking ${booking.id}; booking remains confirmed`,
      err,
    );
  }

  // 7. Success.
  return {
    status: "success",
    confirmation: {
      eventName: eventType.name,
      hostName,
      inviteeEmail: email,
      startIso: slot.start.toISOString(),
      endIso: slot.end.toISOString(),
      inviteeTimezone,
      meetLink,
    },
  };
}
