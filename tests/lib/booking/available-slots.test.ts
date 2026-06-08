import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DateTime } from "luxon";

import { closeDb, db } from "@/lib/db";
import {
  availabilityOverrides,
  availabilityRules,
  bookings,
  eventTypes,
  hostSettings,
  noclucalUsers,
} from "@/lib/db/schema";
import {
  CalendarUnavailableError,
  NotBookableError,
  getAvailableSlots,
  type ExternalBusyResolver,
} from "@/lib/booking/available-slots";

const USER_A = "01940000-0000-7000-8000-0000000000a1";
const MISSING_EVENT_TYPE = "01940000-0000-7000-8000-0000dead0000";

// Host timezone UTC keeps wall-clock equal to the instant, so the seeded
// 09:00 to 17:00 availability maps directly to 09:00Z to 17:00Z slots.
const TZ = "UTC";
const DATE = "2026-07-01";
// Derive the ISO weekday from the same date and zone the slots fall on, so the
// recurring rule and the test date can never drift apart.
const WEEKDAY = DateTime.fromISO(DATE, { zone: TZ }).weekday;

const at = (iso: string): Date => new Date(iso);

const RANGE_START = at("2026-07-01T00:00:00.000Z");
const RANGE_END = at("2026-07-02T00:00:00.000Z");
// Well before the window, so the default 0-minute min-notice clips nothing and
// the default 60-day max-future comfortably covers the range.
const NOW = at("2026-06-08T00:00:00.000Z");

const noConnection: ExternalBusyResolver = async () => ({
  connected: false,
  busy: [],
});

function connectedWith(
  busy: { start: Date; end: Date }[],
): ExternalBusyResolver {
  return async () => ({ connected: true, busy });
}

async function seedRule(
  weekday: number,
  startTime: string,
  endTime: string,
): Promise<void> {
  await db
    .insert(availabilityRules)
    .values({ userId: USER_A, weekday, startTime, endTime });
}

async function seedHostTimezone(timezone: string): Promise<void> {
  await db.insert(hostSettings).values({ userId: USER_A, timezone });
}

async function seedEventType(
  overrides: Partial<typeof eventTypes.$inferInsert> = {},
): Promise<typeof eventTypes.$inferSelect> {
  const [row] = await db
    .insert(eventTypes)
    .values({
      userId: USER_A,
      name: "Intro call",
      slug: "intro-call",
      durationMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      minNoticeMinutes: 0,
      maxFutureMinutes: 86400,
      slotGranularityMinutes: 30,
      enabled: true,
      ...overrides,
    })
    .returning();
  return row;
}

async function seedBooking(args: {
  startsAt: string;
  endsAt: string;
  status: string;
}): Promise<void> {
  await db.insert(bookings).values({
    hostUserId: USER_A,
    eventTypeId: null,
    eventTypeName: "Existing booking",
    durationMinutes: 30,
    inviteeName: "Carol",
    inviteeEmail: "carol@example.com",
    inviteeNote: null,
    inviteeTimezone: "UTC",
    startsAt: at(args.startsAt),
    endsAt: at(args.endsAt),
    status: args.status,
  });
}

function startIsoStrings(slots: { start: Date }[]): string[] {
  return slots.map((s) => s.start.toISOString());
}

async function clearAll(): Promise<void> {
  await db.delete(bookings);
  await db.delete(availabilityOverrides);
  await db.delete(availabilityRules);
  await db.delete(hostSettings);
  await db.delete(eventTypes);
  await db.delete(noclucalUsers);
}

describe("getAvailableSlots", () => {
  beforeEach(async () => {
    await clearAll();
    await db.insert(noclucalUsers).values({ id: USER_A, username: "alice" });
    await seedRule(WEEKDAY, "09:00", "17:00");
    await seedHostTimezone(TZ);
  });

  afterAll(async () => {
    await clearAll();
    await closeDb();
  });

  it("computes slots and excludes an external busy block (connected)", async () => {
    const et = await seedEventType();

    const result = await getAvailableSlots(
      {
        hostUserId: USER_A,
        eventTypeId: et.id,
        rangeStart: RANGE_START,
        rangeEnd: RANGE_END,
        now: NOW,
      },
      {
        resolveExternalBusy: connectedWith([
          {
            start: at("2026-07-01T10:00:00.000Z"),
            end: at("2026-07-01T10:30:00.000Z"),
          },
        ]),
      },
    );

    expect(result.externalBusyChecked).toBe(true);
    const starts = startIsoStrings(result.slots);
    // 16 baseline slots (09:00 to 16:30, every 30 min); the 10:00 slot is gone.
    expect(result.slots).toHaveLength(15);
    expect(starts).not.toContain("2026-07-01T10:00:00.000Z");
    // Abutting slots survive: half-open overlap.
    expect(starts).toContain("2026-07-01T09:30:00.000Z");
    expect(starts).toContain("2026-07-01T10:30:00.000Z");
  });

  it("degrades to availability-only when there is no connection", async () => {
    const et = await seedEventType();

    const result = await getAvailableSlots(
      {
        hostUserId: USER_A,
        eventTypeId: et.id,
        rangeStart: RANGE_START,
        rangeEnd: RANGE_END,
        now: NOW,
      },
      { resolveExternalBusy: noConnection },
    );

    expect(result.externalBusyChecked).toBe(false);
    expect(result.slots).toHaveLength(16);
  });

  it("excludes a slot overlapping an internal confirmed booking (no connection)", async () => {
    const et = await seedEventType();
    await seedBooking({
      startsAt: "2026-07-01T11:00:00.000Z",
      endsAt: "2026-07-01T11:30:00.000Z",
      status: "confirmed",
    });

    const result = await getAvailableSlots(
      {
        hostUserId: USER_A,
        eventTypeId: et.id,
        rangeStart: RANGE_START,
        rangeEnd: RANGE_END,
        now: NOW,
      },
      { resolveExternalBusy: noConnection },
    );

    expect(result.externalBusyChecked).toBe(false);
    const starts = startIsoStrings(result.slots);
    expect(result.slots).toHaveLength(15);
    expect(starts).not.toContain("2026-07-01T11:00:00.000Z");
  });

  it("excludes both external and internal busy (union)", async () => {
    const et = await seedEventType();
    await seedBooking({
      startsAt: "2026-07-01T11:00:00.000Z",
      endsAt: "2026-07-01T11:30:00.000Z",
      status: "confirmed",
    });

    const result = await getAvailableSlots(
      {
        hostUserId: USER_A,
        eventTypeId: et.id,
        rangeStart: RANGE_START,
        rangeEnd: RANGE_END,
        now: NOW,
      },
      {
        resolveExternalBusy: connectedWith([
          {
            start: at("2026-07-01T10:00:00.000Z"),
            end: at("2026-07-01T10:30:00.000Z"),
          },
        ]),
      },
    );

    expect(result.externalBusyChecked).toBe(true);
    const starts = startIsoStrings(result.slots);
    expect(result.slots).toHaveLength(14);
    expect(starts).not.toContain("2026-07-01T10:00:00.000Z");
    expect(starts).not.toContain("2026-07-01T11:00:00.000Z");
  });

  it("does not let a cancelled booking block a slot", async () => {
    const et = await seedEventType();
    await seedBooking({
      startsAt: "2026-07-01T12:00:00.000Z",
      endsAt: "2026-07-01T12:30:00.000Z",
      status: "cancelled",
    });

    const result = await getAvailableSlots(
      {
        hostUserId: USER_A,
        eventTypeId: et.id,
        rangeStart: RANGE_START,
        rangeEnd: RANGE_END,
        now: NOW,
      },
      { resolveExternalBusy: noConnection },
    );

    const starts = startIsoStrings(result.slots);
    expect(result.slots).toHaveLength(16);
    expect(starts).toContain("2026-07-01T12:00:00.000Z");
  });

  it("throws CalendarUnavailableError when the resolver throws", async () => {
    const et = await seedEventType();

    await expect(
      getAvailableSlots(
        {
          hostUserId: USER_A,
          eventTypeId: et.id,
          rangeStart: RANGE_START,
          rangeEnd: RANGE_END,
          now: NOW,
        },
        {
          resolveExternalBusy: async () => {
            throw new Error("freebusy failed");
          },
        },
      ),
    ).rejects.toBeInstanceOf(CalendarUnavailableError);
  });

  it("throws NotBookableError for a disabled event type", async () => {
    const et = await seedEventType({ slug: "disabled-call", enabled: false });

    await expect(
      getAvailableSlots(
        {
          hostUserId: USER_A,
          eventTypeId: et.id,
          rangeStart: RANGE_START,
          rangeEnd: RANGE_END,
          now: NOW,
        },
        { resolveExternalBusy: noConnection },
      ),
    ).rejects.toBeInstanceOf(NotBookableError);
  });

  it("throws NotBookableError for a missing event type id", async () => {
    await expect(
      getAvailableSlots(
        {
          hostUserId: USER_A,
          eventTypeId: MISSING_EVENT_TYPE,
          rangeStart: RANGE_START,
          rangeEnd: RANGE_END,
          now: NOW,
        },
        { resolveExternalBusy: noConnection },
      ),
    ).rejects.toBeInstanceOf(NotBookableError);
  });

  it("flows event-type config through: min-notice drops the leading slot", async () => {
    const et = await seedEventType({
      slug: "min-notice-call",
      minNoticeMinutes: 20,
    });

    // now is 08:50Z, so the min-notice floor is 09:10Z: the 09:00 slot is
    // dropped and the first remaining slot is 09:30Z.
    const result = await getAvailableSlots(
      {
        hostUserId: USER_A,
        eventTypeId: et.id,
        rangeStart: RANGE_START,
        rangeEnd: RANGE_END,
        now: at("2026-07-01T08:50:00.000Z"),
      },
      { resolveExternalBusy: noConnection },
    );

    const starts = startIsoStrings(result.slots);
    expect(result.slots).toHaveLength(15);
    expect(starts).not.toContain("2026-07-01T09:00:00.000Z");
    expect(starts[0]).toBe("2026-07-01T09:30:00.000Z");
  });
});
