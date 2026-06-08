import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { closeDb, db } from "@/lib/db";
import { bookings, eventTypes, noclucalUsers } from "@/lib/db/schema";
import {
  BOOKING_STATUSES,
  DEFAULT_BOOKING_STATUS,
} from "@/lib/bookings/constants";
import {
  BookingConflictError,
  createBooking,
  getBooking,
  listBookingsForHost,
  type CreateBookingInput,
} from "@/lib/bookings/queries";

const USER_A = "01940000-0000-7000-8000-0000000000a1";
const USER_B = "01940000-0000-7000-8000-0000000000b2";
const MISSING_ID = "01940000-0000-7000-8000-0000dead0000";

const at = (iso: string): Date => new Date(iso);

function makeInput(
  overrides: Partial<CreateBookingInput> = {},
): CreateBookingInput {
  return {
    hostUserId: USER_A,
    eventTypeId: null,
    eventTypeName: "Intro call",
    durationMinutes: 30,
    inviteeName: "Carol",
    inviteeEmail: "carol@example.com",
    inviteeNote: null,
    inviteeTimezone: "America/New_York",
    startsAt: at("2026-07-01T10:00:00.000Z"),
    endsAt: at("2026-07-01T10:30:00.000Z"),
    ...overrides,
  };
}

async function seedUsers(): Promise<void> {
  await db.insert(noclucalUsers).values([
    { id: USER_A, username: "alice", displayName: "Alice" },
    { id: USER_B, username: "bob", displayName: "Bob" },
  ]);
}

/** Insert an event type for the FK-snapshot test and return its id. */
async function seedEventType(userId: string): Promise<string> {
  const [row] = await db
    .insert(eventTypes)
    .values({
      userId,
      name: "Intro call",
      slug: "intro-call",
      durationMinutes: 30,
    })
    .returning({ id: eventTypes.id });
  return row.id;
}

describe("booking constants", () => {
  it("includes the default status in the status list", () => {
    expect(BOOKING_STATUSES).toContain(DEFAULT_BOOKING_STATUS);
    expect(DEFAULT_BOOKING_STATUS).toBe("confirmed");
  });
});

describe("booking queries", () => {
  beforeEach(async () => {
    await db.delete(bookings);
    await db.delete(eventTypes);
    await db.delete(noclucalUsers);
    await seedUsers();
  });

  afterAll(async () => {
    await db.delete(bookings);
    await db.delete(eventTypes);
    await db.delete(noclucalUsers);
    await closeDb();
  });

  describe("createBooking / getBooking", () => {
    it("creates a confirmed booking and reads back its snapshot and timestamps", async () => {
      const created = await createBooking(
        makeInput({
          eventTypeName: "Discovery call",
          durationMinutes: 45,
          inviteeName: "Carol",
          inviteeEmail: "carol@example.com",
          inviteeNote: "Looking forward to it",
          inviteeTimezone: "Europe/London",
        }),
      );

      expect(created.hostUserId).toBe(USER_A);
      expect(created.status).toBe("confirmed");
      expect(created.eventTypeName).toBe("Discovery call");
      expect(created.durationMinutes).toBe(45);
      expect(created.inviteeNote).toBe("Looking forward to it");
      expect(created.inviteeTimezone).toBe("Europe/London");
      expect(created.startsAt).toBeInstanceOf(Date);
      expect(created.endsAt).toBeInstanceOf(Date);
      expect(created.createdAt).toBeInstanceOf(Date);
      expect(created.updatedAt).toBeInstanceOf(Date);

      const fetched = await getBooking({ hostUserId: USER_A, id: created.id });
      expect(fetched?.id).toBe(created.id);
      expect(fetched?.eventTypeName).toBe("Discovery call");
      expect(fetched?.startsAt.toISOString()).toBe("2026-07-01T10:00:00.000Z");
      expect(fetched?.endsAt.toISOString()).toBe("2026-07-01T10:30:00.000Z");
    });

    it("returns null when reading another host's booking by id", async () => {
      const created = await createBooking(makeInput({ hostUserId: USER_A }));
      const asOther = await getBooking({ hostUserId: USER_B, id: created.id });
      expect(asOther).toBeNull();
    });

    it("returns null when the id does not exist", async () => {
      const result = await getBooking({ hostUserId: USER_A, id: MISSING_ID });
      expect(result).toBeNull();
    });
  });

  describe("listBookingsForHost", () => {
    it("orders by start ascending and isolates by host", async () => {
      await createBooking(
        makeInput({
          startsAt: at("2026-07-01T12:00:00.000Z"),
          endsAt: at("2026-07-01T12:30:00.000Z"),
        }),
      );
      await createBooking(
        makeInput({
          startsAt: at("2026-07-01T09:00:00.000Z"),
          endsAt: at("2026-07-01T09:30:00.000Z"),
        }),
      );
      await createBooking(
        makeInput({
          startsAt: at("2026-07-01T11:00:00.000Z"),
          endsAt: at("2026-07-01T11:30:00.000Z"),
        }),
      );
      await createBooking(
        makeInput({
          hostUserId: USER_B,
          startsAt: at("2026-07-01T10:00:00.000Z"),
          endsAt: at("2026-07-01T10:30:00.000Z"),
        }),
      );

      const listA = await listBookingsForHost(USER_A);
      expect(listA.map((b) => b.startsAt.toISOString())).toEqual([
        "2026-07-01T09:00:00.000Z",
        "2026-07-01T11:00:00.000Z",
        "2026-07-01T12:00:00.000Z",
      ]);

      const listB = await listBookingsForHost(USER_B);
      expect(listB).toHaveLength(1);
      expect(listB[0].hostUserId).toBe(USER_B);
    });

    it("returns an empty array for a host with no bookings", async () => {
      expect(await listBookingsForHost(USER_A)).toEqual([]);
    });
  });

  describe("double-booking exclusion constraint", () => {
    it("rejects a second confirmed booking overlapping an existing one for the same host", async () => {
      await createBooking(
        makeInput({
          startsAt: at("2026-07-01T10:00:00.000Z"),
          endsAt: at("2026-07-01T10:30:00.000Z"),
        }),
      );

      await expect(
        createBooking(
          makeInput({
            startsAt: at("2026-07-01T10:15:00.000Z"),
            endsAt: at("2026-07-01T10:45:00.000Z"),
          }),
        ),
      ).rejects.toBeInstanceOf(BookingConflictError);

      // The conflicting insert did not land.
      expect(await listBookingsForHost(USER_A)).toHaveLength(1);
    });

    it("allows a non-overlapping confirmed booking for the same host", async () => {
      await createBooking(
        makeInput({
          startsAt: at("2026-07-01T10:00:00.000Z"),
          endsAt: at("2026-07-01T10:30:00.000Z"),
        }),
      );

      const second = await createBooking(
        makeInput({
          startsAt: at("2026-07-01T11:00:00.000Z"),
          endsAt: at("2026-07-01T11:30:00.000Z"),
        }),
      );
      expect(second.id).toBeTruthy();
      expect(await listBookingsForHost(USER_A)).toHaveLength(2);
    });

    it("allows a booking that abuts another exactly (half-open ranges)", async () => {
      await createBooking(
        makeInput({
          startsAt: at("2026-07-01T10:00:00.000Z"),
          endsAt: at("2026-07-01T10:30:00.000Z"),
        }),
      );

      // Starts exactly when the first ends: no overlap under [) semantics.
      const abutting = await createBooking(
        makeInput({
          startsAt: at("2026-07-01T10:30:00.000Z"),
          endsAt: at("2026-07-01T11:00:00.000Z"),
        }),
      );
      expect(abutting.id).toBeTruthy();
      expect(await listBookingsForHost(USER_A)).toHaveLength(2);
    });

    it("allows an overlapping confirmed booking for a different host (guard is per host)", async () => {
      await createBooking(
        makeInput({
          hostUserId: USER_A,
          startsAt: at("2026-07-01T10:00:00.000Z"),
          endsAt: at("2026-07-01T10:30:00.000Z"),
        }),
      );

      const forB = await createBooking(
        makeInput({
          hostUserId: USER_B,
          startsAt: at("2026-07-01T10:15:00.000Z"),
          endsAt: at("2026-07-01T10:45:00.000Z"),
        }),
      );
      expect(forB.hostUserId).toBe(USER_B);
    });

    it("does not let a cancelled booking block a confirmed booking in the same window", async () => {
      // Insert a cancelled booking directly (createBooking only writes confirmed).
      await db.insert(bookings).values({
        hostUserId: USER_A,
        eventTypeId: null,
        eventTypeName: "Cancelled call",
        durationMinutes: 30,
        inviteeName: "Dave",
        inviteeEmail: "dave@example.com",
        inviteeNote: null,
        inviteeTimezone: "UTC",
        startsAt: at("2026-07-01T10:00:00.000Z"),
        endsAt: at("2026-07-01T10:30:00.000Z"),
        status: "cancelled",
      });

      const confirmed = await createBooking(
        makeInput({
          startsAt: at("2026-07-01T10:00:00.000Z"),
          endsAt: at("2026-07-01T10:30:00.000Z"),
        }),
      );
      expect(confirmed.status).toBe("confirmed");
      expect(await listBookingsForHost(USER_A)).toHaveLength(2);
    });
  });

  describe("immutable history on event-type deletion", () => {
    it("sets event_type_id to null and keeps the booking and its snapshot", async () => {
      const eventTypeId = await seedEventType(USER_A);

      const created = await createBooking(
        makeInput({
          eventTypeId,
          eventTypeName: "Intro call",
          durationMinutes: 30,
        }),
      );
      expect(created.eventTypeId).toBe(eventTypeId);

      await db.delete(eventTypes).where(eq(eventTypes.id, eventTypeId));

      const after = await getBooking({ hostUserId: USER_A, id: created.id });
      expect(after).not.toBeNull();
      expect(after?.eventTypeId).toBeNull();
      // The snapshot still describes the booking after the event type is gone.
      expect(after?.eventTypeName).toBe("Intro call");
      expect(after?.durationMinutes).toBe(30);
    });
  });
});
