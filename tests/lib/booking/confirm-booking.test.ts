import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { closeDb, db } from "@/lib/db";
import { bookings, eventTypes, noclucalUsers } from "@/lib/db/schema";
import { listBookingsForHost } from "@/lib/bookings/queries";
import {
  confirmBooking,
  type ConfirmBookingArgs,
  type ConfirmBookingDeps,
  type CreateCalendarEvent,
  type CreateCalendarEventArgs,
} from "@/app/[username]/[slug]/actions";
import type { AvailableSlotsResult } from "@/lib/booking/available-slots";

const USER_A = "01940000-0000-7000-8000-0000000000a1";

const SLOT_START = new Date("2026-07-01T10:00:00.000Z");
const SLOT_END = new Date("2026-07-01T10:30:00.000Z");
const START_ISO = SLOT_START.toISOString();
const END_ISO = SLOT_END.toISOString();

const GOOGLE_REFS = {
  eventId: "evt-123",
  htmlLink: "https://www.google.com/calendar/event?eid=evt-123",
  meetLink: "https://meet.google.com/abc-defg-hij",
};

// Tracks calls to the injected Google write-back so each test can assert
// whether the event was (or was not) created.
let createCalls: CreateCalendarEventArgs[] = [];

const recordingCreate: CreateCalendarEvent = async (args) => {
  createCalls.push(args);
  return { ...GOOGLE_REFS };
};

const throwingCreate: CreateCalendarEvent = async (args) => {
  createCalls.push(args);
  throw new Error("Google is down");
};

/** Stub `getAvailableSlots` to return a fixed slot set; the re-check never hits
 *  the real engine or Google. */
function stubSlots(slots: { start: Date; end: Date }[]): ConfirmBookingDeps["getAvailableSlots"] {
  return async (): Promise<AvailableSlotsResult> => ({
    slots,
    externalBusyChecked: true,
  });
}

function makeDeps(
  overrides: Partial<ConfirmBookingDeps> = {},
): ConfirmBookingDeps {
  return {
    getAvailableSlots: stubSlots([{ start: SLOT_START, end: SLOT_END }]),
    createCalendarEvent: recordingCreate,
    ...overrides,
  };
}

function makeArgs(overrides: Partial<ConfirmBookingArgs> = {}): ConfirmBookingArgs {
  return {
    username: "alice",
    slug: "intro-call",
    startIso: START_ISO,
    endIso: END_ISO,
    name: "Carol",
    email: "carol@example.com",
    note: "Looking forward to it",
    inviteeTimezone: "America/New_York",
    ...overrides,
  };
}

async function seedEventType(
  overrides: Partial<typeof eventTypes.$inferInsert> = {},
): Promise<void> {
  await db.insert(eventTypes).values({
    userId: USER_A,
    name: "Intro call",
    slug: "intro-call",
    durationMinutes: 30,
    enabled: true,
    ...overrides,
  });
}

async function clearAll(): Promise<void> {
  await db.delete(bookings);
  await db.delete(eventTypes);
  await db.delete(noclucalUsers);
}

describe("confirmBooking", () => {
  beforeEach(async () => {
    createCalls = [];
    await clearAll();
    await db
      .insert(noclucalUsers)
      .values({ id: USER_A, username: "alice", displayName: "Alice" });
    await seedEventType();
  });

  afterAll(async () => {
    await clearAll();
    await closeDb();
  });

  it("happy path: claims the slot, stores Google refs, returns success", async () => {
    const res = await confirmBooking(makeArgs(), makeDeps());

    expect(res.status).toBe("success");
    if (res.status !== "success") throw new Error("expected success");
    expect(res.confirmation.eventName).toBe("Intro call");
    expect(res.confirmation.hostName).toBe("Alice");
    expect(res.confirmation.inviteeEmail).toBe("carol@example.com");
    expect(res.confirmation.startIso).toBe(START_ISO);
    expect(res.confirmation.meetLink).toBe(GOOGLE_REFS.meetLink);

    // The Google write-back ran once with the composed summary.
    expect(createCalls).toHaveLength(1);
    expect(createCalls[0].summary).toBe("Intro call with Carol");
    expect(createCalls[0].inviteeEmail).toBe("carol@example.com");

    const rows = await listBookingsForHost(USER_A);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("confirmed");
    expect(rows[0].inviteeName).toBe("Carol");
    expect(rows[0].inviteeEmail).toBe("carol@example.com");
    expect(rows[0].inviteeNote).toBe("Looking forward to it");
    expect(rows[0].eventTypeName).toBe("Intro call");
    expect(rows[0].durationMinutes).toBe(30);
    expect(rows[0].startsAt.toISOString()).toBe(START_ISO);
    expect(rows[0].endsAt.toISOString()).toBe(END_ISO);
    expect(rows[0].googleEventId).toBe(GOOGLE_REFS.eventId);
    expect(rows[0].googleHtmlLink).toBe(GOOGLE_REFS.htmlLink);
    expect(rows[0].meetLink).toBe(GOOGLE_REFS.meetLink);
  });

  it("conflict: a pre-existing booking makes the claim raise, no event is created", async () => {
    // Someone already holds the slot (the internal race the constraint catches).
    await db.insert(bookings).values({
      hostUserId: USER_A,
      eventTypeId: null,
      eventTypeName: "Existing",
      durationMinutes: 30,
      inviteeName: "Dave",
      inviteeEmail: "dave@example.com",
      inviteeNote: null,
      inviteeTimezone: "UTC",
      startsAt: SLOT_START,
      endsAt: SLOT_END,
      status: "confirmed",
    });

    // The re-check still reports the slot as free (TOCTOU): the constraint is
    // the authoritative defense.
    const res = await confirmBooking(makeArgs(), makeDeps());

    expect(res.status).toBe("conflict");
    expect(createCalls).toHaveLength(0);
    // Only the pre-existing booking survives; the second insert did not land.
    expect(await listBookingsForHost(USER_A)).toHaveLength(1);
  });

  it("unavailable: the re-check no longer offers the slot, nothing is written", async () => {
    const res = await confirmBooking(
      makeArgs(),
      makeDeps({ getAvailableSlots: stubSlots([]) }),
    );

    expect(res.status).toBe("unavailable");
    expect(createCalls).toHaveLength(0);
    expect(await listBookingsForHost(USER_A)).toHaveLength(0);
  });

  it("Google failure: the booking persists confirmed with null refs, still success", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await confirmBooking(
      makeArgs(),
      makeDeps({ createCalendarEvent: throwingCreate }),
    );

    expect(res.status).toBe("success");
    if (res.status !== "success") throw new Error("expected success");
    expect(res.confirmation.meetLink).toBeUndefined();
    expect(createCalls).toHaveLength(1);

    const rows = await listBookingsForHost(USER_A);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("confirmed");
    expect(rows[0].googleEventId).toBeNull();
    expect(rows[0].googleHtmlLink).toBeNull();
    expect(rows[0].meetLink).toBeNull();

    errorSpy.mockRestore();
  });

  it("validation: invalid email returns invalid with no write", async () => {
    const res = await confirmBooking(
      makeArgs({ email: "not-an-email" }),
      makeDeps(),
    );

    expect(res.status).toBe("invalid");
    if (res.status !== "invalid") throw new Error("expected invalid");
    expect(res.errors.email).toBeTruthy();
    expect(createCalls).toHaveLength(0);
    expect(await listBookingsForHost(USER_A)).toHaveLength(0);
  });

  it("validation: empty name returns invalid with no write", async () => {
    const res = await confirmBooking(makeArgs({ name: "   " }), makeDeps());

    expect(res.status).toBe("invalid");
    if (res.status !== "invalid") throw new Error("expected invalid");
    expect(res.errors.name).toBeTruthy();
    expect(createCalls).toHaveLength(0);
    expect(await listBookingsForHost(USER_A)).toHaveLength(0);
  });

  it("not bookable: an unknown username returns not_bookable", async () => {
    const res = await confirmBooking(
      makeArgs({ username: "nobody" }),
      makeDeps(),
    );

    expect(res.status).toBe("not_bookable");
    expect(createCalls).toHaveLength(0);
    expect(await listBookingsForHost(USER_A)).toHaveLength(0);
  });

  it("not bookable: a disabled event type returns not_bookable", async () => {
    await seedEventType({ slug: "disabled-call", enabled: false });

    const res = await confirmBooking(
      makeArgs({ slug: "disabled-call" }),
      makeDeps(),
    );

    expect(res.status).toBe("not_bookable");
    expect(createCalls).toHaveLength(0);
    expect(await listBookingsForHost(USER_A)).toHaveLength(0);
  });
});
