import { and, asc, eq, gt, lt } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { BookingRow } from "@/lib/db/schema/bookings";
import { DEFAULT_BOOKING_STATUS } from "./constants";

/**
 * Thrown by `createBooking` when the host already has a confirmed booking
 * overlapping the requested time range. Maps the Postgres exclusion-violation
 * (23P01) on `bookings_no_overlap_per_host` to a friendly error instead of
 * letting a raw DB error surface as a 500. This is the hard floor of the
 * double-booking defense (see CALENDAR-PLAYBOOK.md § Booking model).
 */
export class BookingConflictError extends Error {
  constructor() {
    super("That time was just booked. Please pick another slot.");
    this.name = "BookingConflictError";
  }
}

// Drizzle wraps the failing query in an error whose `cause` is the underlying
// pg error; the SQLSTATE `code` (23P01 for an exclusion violation) lives on
// that cause. Walk the cause chain so the check works whether the code is on
// the thrown error or one nested below it. Same technique as
// event-types/queries.ts#isUniqueViolation, different SQLSTATE.
function isExclusionViolation(err: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = err;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    if ((current as { code?: string }).code === "23P01") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Typed input for `createBooking`. No Zod here; invitee input validation is
 * Phase 4d's concern, where untrusted input enters the system. The booking
 * snapshots the event type name and duration at booking time, so those travel
 * as explicit fields rather than being read from the (nullable) event type.
 */
export interface CreateBookingInput {
  hostUserId: string;
  eventTypeId: string | null;
  eventTypeName: string;
  durationMinutes: number;
  inviteeName: string;
  inviteeEmail: string;
  inviteeNote: string | null;
  inviteeTimezone: string;
  startsAt: Date;
  endsAt: Date;
}

/**
 * Insert a confirmed booking and return the row. Throws BookingConflictError
 * if the host already has a confirmed booking overlapping the time range (the
 * `bookings_no_overlap_per_host` exclusion constraint enforces this at the
 * database level, so concurrent requests cannot both win).
 */
export async function createBooking(
  input: CreateBookingInput,
): Promise<BookingRow> {
  try {
    const [row] = await db
      .insert(schema.bookings)
      .values({
        hostUserId: input.hostUserId,
        eventTypeId: input.eventTypeId,
        eventTypeName: input.eventTypeName,
        durationMinutes: input.durationMinutes,
        inviteeName: input.inviteeName,
        inviteeEmail: input.inviteeEmail,
        inviteeNote: input.inviteeNote,
        inviteeTimezone: input.inviteeTimezone,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        status: DEFAULT_BOOKING_STATUS,
      })
      .returning();
    return row;
  } catch (err) {
    if (isExclusionViolation(err)) throw new BookingConflictError();
    throw err;
  }
}

/** All of a host's bookings, earliest start first. Scoped to the host. */
export async function listBookingsForHost(
  hostUserId: string,
): Promise<BookingRow[]> {
  return db
    .select()
    .from(schema.bookings)
    .where(eq(schema.bookings.hostUserId, hostUserId))
    .orderBy(asc(schema.bookings.startsAt));
}

/**
 * A single booking by id, scoped to the owning host. Filtering on both
 * `hostUserId` and `id` means a host cannot read another host's booking by
 * guessing its id. Returns null when no row matches.
 */
export async function getBooking(args: {
  hostUserId: string;
  id: string;
}): Promise<BookingRow | null> {
  const row = await db.query.bookings.findFirst({
    where: and(
      eq(schema.bookings.hostUserId, args.hostUserId),
      eq(schema.bookings.id, args.id),
    ),
  });
  return row ?? null;
}

/**
 * A host's confirmed bookings whose `[startsAt, endsAt)` overlaps the half-open
 * window `[windowStart, windowEnd)`. Scoped to the host and to confirmed
 * status, so cancelled bookings never block availability. This is the internal
 * half of the busy set in `getAvailableSlots`: a slot already booked through
 * noCluCal is excluded immediately, before the Google write-back propagates
 * (see CALENDAR-PLAYBOOK.md § Available-slots orchestration). Overlap is
 * half-open (`startsAt < windowEnd AND endsAt > windowStart`), matching the
 * convention used throughout slot computation, so a booking abutting a window
 * edge does not count.
 */
export async function listConfirmedBookingsInWindow(
  hostUserId: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<BookingRow[]> {
  return db
    .select()
    .from(schema.bookings)
    .where(
      and(
        eq(schema.bookings.hostUserId, hostUserId),
        eq(schema.bookings.status, DEFAULT_BOOKING_STATUS),
        lt(schema.bookings.startsAt, windowEnd),
        gt(schema.bookings.endsAt, windowStart),
      ),
    )
    .orderBy(asc(schema.bookings.startsAt));
}
