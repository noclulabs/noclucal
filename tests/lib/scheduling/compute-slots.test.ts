import { describe, expect, it } from "vitest";

import { computeSlots } from "@/lib/scheduling/compute-slots";
import type {
  ComputeSlotsInput,
  EventTypeConfig,
  Slot,
} from "@/lib/scheduling/types";

// Generous max-future so the future clamp never interferes unless a test
// sets it deliberately. 365 days in minutes.
const FAR_FUTURE = 60 * 24 * 365;

function evt(over: Partial<EventTypeConfig> = {}): EventTypeConfig {
  return {
    durationMinutes: 30,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    minNoticeMinutes: 0,
    maxFutureMinutes: FAR_FUTURE,
    slotGranularityMinutes: 30,
    ...over,
  };
}

// Build a full input with sensible defaults (UTC host zone, a Monday range,
// a reference clock well before the range). Override only what each case needs.
function input(over: Partial<ComputeSlotsInput> = {}): ComputeSlotsInput {
  return {
    now: new Date("2026-07-01T00:00:00Z"),
    rangeStart: new Date("2026-07-06T00:00:00Z"), // Monday
    rangeEnd: new Date("2026-07-07T00:00:00Z"),
    hostTimezone: "UTC",
    availabilityRules: [],
    availabilityOverrides: [],
    eventType: evt(),
    busy: [],
    ...over,
  };
}

const starts = (slots: Slot[]): string[] =>
  slots.map((s) => s.start.toISOString());
const ends = (slots: Slot[]): string[] => slots.map((s) => s.end.toISOString());

describe("computeSlots", () => {
  // ---------------------------------------------------------------------------
  // Group A: basic generation
  // ---------------------------------------------------------------------------
  describe("basic generation", () => {
    it("generates aligned slots inside a single window", () => {
      const slots = computeSlots(
        input({
          availabilityRules: [
            { weekday: 1, startTime: "09:00", endTime: "10:00" },
          ],
        }),
      );

      expect(starts(slots)).toEqual([
        "2026-07-06T09:00:00.000Z",
        "2026-07-06T09:30:00.000Z",
      ]);
      expect(slots[0].end.toISOString()).toBe("2026-07-06T09:30:00.000Z");
    });

    it("emits exact starts, ends, and count when granularity divides the window", () => {
      // 09:00 to 11:00, 60-minute slots every 30 minutes: 09:00, 09:30, 10:00.
      const slots = computeSlots(
        input({
          availabilityRules: [
            { weekday: 1, startTime: "09:00", endTime: "11:00" },
          ],
          eventType: evt({ durationMinutes: 60, slotGranularityMinutes: 30 }),
        }),
      );

      expect(starts(slots)).toEqual([
        "2026-07-06T09:00:00.000Z",
        "2026-07-06T09:30:00.000Z",
        "2026-07-06T10:00:00.000Z",
      ]);
      expect(ends(slots)).toEqual([
        "2026-07-06T10:00:00.000Z",
        "2026-07-06T10:30:00.000Z",
        "2026-07-06T11:00:00.000Z",
      ]);
    });

    it("excludes the trailing partial slot when duration does not divide the window", () => {
      // 09:00 to 10:00, 45-minute slots every 15 minutes. 09:00 and 09:15 fit;
      // a 09:30 start would end at 10:15, past the window, so it is excluded.
      const slots = computeSlots(
        input({
          availabilityRules: [
            { weekday: 1, startTime: "09:00", endTime: "10:00" },
          ],
          eventType: evt({ durationMinutes: 45, slotGranularityMinutes: 15 }),
        }),
      );

      expect(starts(slots)).toEqual([
        "2026-07-06T09:00:00.000Z",
        "2026-07-06T09:15:00.000Z",
      ]);
      expect(ends(slots)).toEqual([
        "2026-07-06T09:45:00.000Z",
        "2026-07-06T10:00:00.000Z",
      ]);
    });

    it("produces overlapping starts when granularity is smaller than duration", () => {
      // 30-minute slots every 15 minutes inside 09:00 to 10:00.
      const slots = computeSlots(
        input({
          availabilityRules: [
            { weekday: 1, startTime: "09:00", endTime: "10:00" },
          ],
          eventType: evt({ durationMinutes: 30, slotGranularityMinutes: 15 }),
        }),
      );

      expect(starts(slots)).toEqual([
        "2026-07-06T09:00:00.000Z",
        "2026-07-06T09:15:00.000Z",
        "2026-07-06T09:30:00.000Z",
      ]);
    });

    it("produces slots in both windows of a split day with nothing in the gap", () => {
      const slots = computeSlots(
        input({
          availabilityRules: [
            { weekday: 1, startTime: "09:00", endTime: "10:00" },
            { weekday: 1, startTime: "13:00", endTime: "14:00" },
          ],
        }),
      );

      expect(starts(slots)).toEqual([
        "2026-07-06T09:00:00.000Z",
        "2026-07-06T09:30:00.000Z",
        "2026-07-06T13:00:00.000Z",
        "2026-07-06T13:30:00.000Z",
      ]);
    });

    it("returns an empty array when there are no rules", () => {
      expect(computeSlots(input({ availabilityRules: [] }))).toEqual([]);
    });

    it("returns an empty array when no rule matches a weekday in the range", () => {
      // Range covers Monday (1) and Tuesday (2); the only rule is Saturday (6).
      const slots = computeSlots(
        input({
          rangeEnd: new Date("2026-07-08T00:00:00Z"),
          availabilityRules: [
            { weekday: 6, startTime: "09:00", endTime: "10:00" },
          ],
        }),
      );
      expect(slots).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Group B: overrides (replace-with-block-wins)
  // ---------------------------------------------------------------------------
  describe("overrides", () => {
    it("blocks a date with a full-day block override while neighbors are unaffected", () => {
      // Monday and Tuesday both have a recurring rule; Monday is blocked.
      const slots = computeSlots(
        input({
          rangeEnd: new Date("2026-07-08T00:00:00Z"),
          availabilityRules: [
            { weekday: 1, startTime: "09:00", endTime: "10:00" },
            { weekday: 2, startTime: "09:00", endTime: "10:00" },
          ],
          availabilityOverrides: [
            {
              date: "2026-07-06",
              isAvailable: false,
              startTime: null,
              endTime: null,
            },
          ],
        }),
      );

      // Monday produces nothing; Tuesday is untouched.
      expect(starts(slots)).toEqual([
        "2026-07-07T09:00:00.000Z",
        "2026-07-07T09:30:00.000Z",
      ]);
    });

    it("uses only the override hours, not the recurring rule, on a replaced date", () => {
      // Core replace-not-merge assertion: the recurring rule says 09:00 to
      // 12:00, the override says 14:00 to 15:00. Only the override applies.
      const slots = computeSlots(
        input({
          availabilityRules: [
            { weekday: 1, startTime: "09:00", endTime: "12:00" },
          ],
          availabilityOverrides: [
            {
              date: "2026-07-06",
              isAvailable: true,
              startTime: "14:00",
              endTime: "15:00",
            },
          ],
        }),
      );

      expect(starts(slots)).toEqual([
        "2026-07-06T14:00:00.000Z",
        "2026-07-06T14:30:00.000Z",
      ]);
      // None of the recurring-rule slots leak through.
      expect(starts(slots)).not.toContain("2026-07-06T09:00:00.000Z");
    });

    it("adds availability via an override on a weekday with no recurring rule", () => {
      // The only rule is Friday (5); the override lands on Monday (1).
      const slots = computeSlots(
        input({
          availabilityRules: [
            { weekday: 5, startTime: "09:00", endTime: "10:00" },
          ],
          availabilityOverrides: [
            {
              date: "2026-07-06",
              isAvailable: true,
              startTime: "09:00",
              endTime: "10:00",
            },
          ],
        }),
      );

      expect(starts(slots)).toEqual([
        "2026-07-06T09:00:00.000Z",
        "2026-07-06T09:30:00.000Z",
      ]);
    });

    it("resolves to empty when a date has both a block row and an available row (block wins)", () => {
      const slots = computeSlots(
        input({
          availabilityOverrides: [
            {
              date: "2026-07-06",
              isAvailable: false,
              startTime: null,
              endTime: null,
            },
            {
              date: "2026-07-06",
              isAvailable: true,
              startTime: "09:00",
              endTime: "10:00",
            },
          ],
        }),
      );
      expect(slots).toEqual([]);
    });

    it("unions two available override rows on one date (split custom day)", () => {
      const slots = computeSlots(
        input({
          availabilityOverrides: [
            {
              date: "2026-07-06",
              isAvailable: true,
              startTime: "09:00",
              endTime: "10:00",
            },
            {
              date: "2026-07-06",
              isAvailable: true,
              startTime: "13:00",
              endTime: "14:00",
            },
          ],
        }),
      );

      expect(starts(slots)).toEqual([
        "2026-07-06T09:00:00.000Z",
        "2026-07-06T09:30:00.000Z",
        "2026-07-06T13:00:00.000Z",
        "2026-07-06T13:30:00.000Z",
      ]);
    });

    it("merges two overlapping override windows without emitting a duplicate slot start", () => {
      const slots = computeSlots(
        input({
          availabilityOverrides: [
            {
              date: "2026-07-06",
              isAvailable: true,
              startTime: "09:00",
              endTime: "10:00",
            },
            {
              date: "2026-07-06",
              isAvailable: true,
              startTime: "09:30",
              endTime: "11:00",
            },
          ],
        }),
      );

      // The union is 09:00 to 11:00; no duplicate 09:30 from the seam.
      expect(starts(slots)).toEqual([
        "2026-07-06T09:00:00.000Z",
        "2026-07-06T09:30:00.000Z",
        "2026-07-06T10:00:00.000Z",
        "2026-07-06T10:30:00.000Z",
      ]);
      expect(new Set(starts(slots)).size).toBe(slots.length);
    });
  });

  // ---------------------------------------------------------------------------
  // Group C: buffers
  // ---------------------------------------------------------------------------
  describe("buffers", () => {
    it("drops a slot whose before-buffer reaches into a busy block", () => {
      // Busy 08:50 to 08:55 does not touch the 09:00 slot itself, but a
      // 15-minute before-buffer extends the guard back to 08:45, overlapping it.
      const base = input({
        availabilityRules: [{ weekday: 1, startTime: "09:00", endTime: "10:00" }],
        busy: [
          {
            start: new Date("2026-07-06T08:50:00Z"),
            end: new Date("2026-07-06T08:55:00Z"),
          },
        ],
      });

      const withBuffer = computeSlots({
        ...base,
        eventType: evt({ bufferBeforeMinutes: 15 }),
      });
      expect(starts(withBuffer)).toEqual(["2026-07-06T09:30:00.000Z"]);

      // Without the buffer, both slots survive: the buffer is the cause.
      const noBuffer = computeSlots({ ...base, eventType: evt() });
      expect(starts(noBuffer)).toEqual([
        "2026-07-06T09:00:00.000Z",
        "2026-07-06T09:30:00.000Z",
      ]);
    });

    it("drops a slot whose after-buffer reaches into a busy block", () => {
      // Busy 10:05 to 10:10 sits past the 09:30 slot end (10:00), but a
      // 15-minute after-buffer extends the guard forward to 10:15.
      const base = input({
        availabilityRules: [{ weekday: 1, startTime: "09:00", endTime: "10:00" }],
        busy: [
          {
            start: new Date("2026-07-06T10:05:00Z"),
            end: new Date("2026-07-06T10:10:00Z"),
          },
        ],
      });

      const withBuffer = computeSlots({
        ...base,
        eventType: evt({ bufferAfterMinutes: 15 }),
      });
      expect(starts(withBuffer)).toEqual(["2026-07-06T09:00:00.000Z"]);

      const noBuffer = computeSlots({ ...base, eventType: evt() });
      expect(starts(noBuffer)).toEqual([
        "2026-07-06T09:00:00.000Z",
        "2026-07-06T09:30:00.000Z",
      ]);
    });

    it("removes only the slots a mid-window busy block overlaps, keeping the rest", () => {
      const slots = computeSlots(
        input({
          availabilityRules: [
            { weekday: 1, startTime: "09:00", endTime: "12:00" },
          ],
          busy: [
            {
              start: new Date("2026-07-06T10:00:00Z"),
              end: new Date("2026-07-06T10:30:00Z"),
            },
          ],
        }),
      );

      // 10:00 overlaps the busy block and drops. 09:30 ends at 10:00 and 10:30
      // starts at 10:30; both touch a boundary (half-open) and survive.
      expect(starts(slots)).toEqual([
        "2026-07-06T09:00:00.000Z",
        "2026-07-06T09:30:00.000Z",
        "2026-07-06T10:30:00.000Z",
        "2026-07-06T11:00:00.000Z",
        "2026-07-06T11:30:00.000Z",
      ]);
    });

    it("with zero buffers, drops only directly overlapping slots", () => {
      const slots = computeSlots(
        input({
          availabilityRules: [
            { weekday: 1, startTime: "09:00", endTime: "12:00" },
          ],
          busy: [
            {
              start: new Date("2026-07-06T09:40:00Z"),
              end: new Date("2026-07-06T09:50:00Z"),
            },
          ],
        }),
      );

      // Only 09:30 (09:30 to 10:00) contains the busy block; everything else stays.
      expect(starts(slots)).toEqual([
        "2026-07-06T09:00:00.000Z",
        "2026-07-06T10:00:00.000Z",
        "2026-07-06T10:30:00.000Z",
        "2026-07-06T11:00:00.000Z",
        "2026-07-06T11:30:00.000Z",
      ]);
    });

    it("keeps a slot that ends exactly when a busy block starts (touching, half-open)", () => {
      const slots = computeSlots(
        input({
          availabilityRules: [
            { weekday: 1, startTime: "09:00", endTime: "10:00" },
          ],
          busy: [
            {
              start: new Date("2026-07-06T09:30:00Z"),
              end: new Date("2026-07-06T10:00:00Z"),
            },
          ],
        }),
      );

      // 09:00 ends at 09:30 exactly when busy starts: kept. 09:30 overlaps: dropped.
      expect(starts(slots)).toEqual(["2026-07-06T09:00:00.000Z"]);
    });
  });

  // ---------------------------------------------------------------------------
  // Group D: min-notice and max-future
  // ---------------------------------------------------------------------------
  describe("min-notice and max-future clamps", () => {
    it("drops slots earlier than now plus min-notice and keeps later ones", () => {
      // now is 2026-07-06T00:00Z; 600 minutes notice pushes the floor to 10:00Z.
      const slots = computeSlots(
        input({
          now: new Date("2026-07-06T00:00:00Z"),
          availabilityRules: [
            { weekday: 1, startTime: "09:00", endTime: "12:00" },
          ],
          eventType: evt({ minNoticeMinutes: 600 }),
        }),
      );

      expect(starts(slots)).toEqual([
        "2026-07-06T10:00:00.000Z",
        "2026-07-06T10:30:00.000Z",
        "2026-07-06T11:00:00.000Z",
        "2026-07-06T11:30:00.000Z",
      ]);
      expect(starts(slots)).not.toContain("2026-07-06T09:30:00.000Z");
    });

    it("drops slots later than now plus max-future", () => {
      // now is 2026-07-06T00:00Z; 630 minutes of future reach caps at 10:30Z.
      // The clamp is strict (< effectiveEnd), so a 10:30 start is excluded.
      const slots = computeSlots(
        input({
          now: new Date("2026-07-06T00:00:00Z"),
          availabilityRules: [
            { weekday: 1, startTime: "09:00", endTime: "12:00" },
          ],
          eventType: evt({ maxFutureMinutes: 630 }),
        }),
      );

      expect(starts(slots)).toEqual([
        "2026-07-06T09:00:00.000Z",
        "2026-07-06T09:30:00.000Z",
        "2026-07-06T10:00:00.000Z",
      ]);
      expect(starts(slots)).not.toContain("2026-07-06T10:30:00.000Z");
    });

    it("returns empty when min-notice pushes the floor past the effective end", () => {
      const slots = computeSlots(
        input({
          now: new Date("2026-07-06T00:00:00Z"),
          availabilityRules: [
            { weekday: 1, startTime: "09:00", endTime: "12:00" },
          ],
          eventType: evt({ minNoticeMinutes: 60 * 24 * 30 }), // 30 days
        }),
      );
      expect(slots).toEqual([]);
    });

    it("drops nothing extra with zero notice and a generous future window", () => {
      const slots = computeSlots(
        input({
          availabilityRules: [
            { weekday: 1, startTime: "09:00", endTime: "10:00" },
          ],
          eventType: evt({ minNoticeMinutes: 0, maxFutureMinutes: FAR_FUTURE }),
        }),
      );
      expect(starts(slots)).toEqual([
        "2026-07-06T09:00:00.000Z",
        "2026-07-06T09:30:00.000Z",
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  // Group E: timezone and DST
  //
  // US transitions in 2026: spring forward is March 8 (02:00 PST jumps to
  // 03:00 PDT), fall back is November 1 (02:00 PDT falls back to 01:00 PST).
  // PST is UTC-8, PDT is UTC-7. Expected instants below are derived from the
  // offset on each side of the transition, not from the engine's output.
  // ---------------------------------------------------------------------------
  describe("timezone and DST", () => {
    it("maps a wall-clock window in a non-UTC zone with the zone offset applied", () => {
      // America/Los_Angeles on a summer Monday is PDT (UTC-7): 09:00 -> 16:00Z.
      const slots = computeSlots(
        input({
          hostTimezone: "America/Los_Angeles",
          availabilityRules: [
            { weekday: 1, startTime: "09:00", endTime: "10:00" },
          ],
        }),
      );

      expect(starts(slots)).toEqual([
        "2026-07-06T16:00:00.000Z",
        "2026-07-06T16:30:00.000Z",
      ]);
    });

    it("attributes a late-night window to the correct local day across a UTC date boundary", () => {
      // A Monday 22:00 PDT window lands on the next UTC date (Tuesday 05:00Z),
      // yet it must be driven by the Monday (1) recurring rule.
      const slots = computeSlots(
        input({
          hostTimezone: "America/Los_Angeles",
          rangeStart: new Date("2026-07-06T00:00:00Z"),
          rangeEnd: new Date("2026-07-08T00:00:00Z"),
          availabilityRules: [
            { weekday: 1, startTime: "22:00", endTime: "23:00" },
          ],
        }),
      );

      expect(starts(slots)).toEqual([
        "2026-07-07T05:00:00.000Z",
        "2026-07-07T05:30:00.000Z",
      ]);
    });

    it("drops the nonexistent wall-clock hour on the spring-forward date", () => {
      // March 8 2026, America/Los_Angeles, window 01:00 to 05:00. Local 02:00
      // to 02:59 does not exist. Before the jump it is PST (UTC-8); after, PDT
      // (UTC-7). 01:00->09:00Z, 01:30->09:30Z, [02:00 and 02:30 dropped],
      // 03:00->10:00Z, 03:30->10:30Z, 04:00->11:00Z, 04:30->11:30Z.
      const slots = computeSlots(
        input({
          now: new Date("2026-03-01T00:00:00Z"),
          rangeStart: new Date("2026-03-08T08:00:00Z"), // 00:00 local (PST)
          rangeEnd: new Date("2026-03-08T20:00:00Z"),
          hostTimezone: "America/Los_Angeles",
          availabilityRules: [
            { weekday: 7, startTime: "01:00", endTime: "05:00" }, // Sunday
          ],
        }),
      );

      expect(starts(slots)).toEqual([
        "2026-03-08T09:00:00.000Z",
        "2026-03-08T09:30:00.000Z",
        "2026-03-08T10:00:00.000Z",
        "2026-03-08T10:30:00.000Z",
        "2026-03-08T11:00:00.000Z",
        "2026-03-08T11:30:00.000Z",
      ]);
      expect(slots).toHaveLength(6);
    });

    it("offers each repeated wall-clock time once on the fall-back date", () => {
      // November 1 2026, America/Los_Angeles, window 00:00 to 04:00. Local
      // 01:00 to 01:59 occurs twice; Luxon resolves the ambiguous time to the
      // pre-transition PDT offset (UTC-7), so it is offered once. Before the
      // fall back it is PDT (UTC-7); after, PST (UTC-8).
      // 00:00->07:00Z, 00:30->07:30Z, 01:00->08:00Z, 01:30->08:30Z (all PDT),
      // 02:00->10:00Z, 02:30->10:30Z, 03:00->11:00Z, 03:30->11:30Z (all PST).
      // The PST occurrence of 01:00/01:30 (09:00Z/09:30Z) is NOT offered.
      const slots = computeSlots(
        input({
          now: new Date("2026-10-25T00:00:00Z"),
          rangeStart: new Date("2026-11-01T07:00:00Z"), // 00:00 local (PDT)
          rangeEnd: new Date("2026-11-01T20:00:00Z"),
          hostTimezone: "America/Los_Angeles",
          availabilityRules: [
            { weekday: 7, startTime: "00:00", endTime: "04:00" }, // Sunday
          ],
        }),
      );

      expect(starts(slots)).toEqual([
        "2026-11-01T07:00:00.000Z",
        "2026-11-01T07:30:00.000Z",
        "2026-11-01T08:00:00.000Z",
        "2026-11-01T08:30:00.000Z",
        "2026-11-01T10:00:00.000Z",
        "2026-11-01T10:30:00.000Z",
        "2026-11-01T11:00:00.000Z",
        "2026-11-01T11:30:00.000Z",
      ]);
      expect(slots).toHaveLength(8);
      // The repeated hour is offered once, not twice.
      expect(starts(slots)).not.toContain("2026-11-01T09:00:00.000Z");
      expect(starts(slots)).not.toContain("2026-11-01T09:30:00.000Z");
    });

    it("applies a half-hour zone offset correctly (Asia/Kolkata, +05:30)", () => {
      // 09:00 IST -> 03:30Z, 09:30 IST -> 04:00Z.
      const slots = computeSlots(
        input({
          hostTimezone: "Asia/Kolkata",
          availabilityRules: [
            { weekday: 1, startTime: "09:00", endTime: "10:00" },
          ],
        }),
      );

      expect(starts(slots)).toEqual([
        "2026-07-06T03:30:00.000Z",
        "2026-07-06T04:00:00.000Z",
      ]);
    });

    it("handles a 00:00 window start and the last fitting slot before the window end", () => {
      // 00:00 to 01:00, 30-minute slots every 15 minutes. The 00:30 start is
      // the last that fits (ends exactly at 01:00). The 00:00 start sits on the
      // effective-start boundary and is kept (clamp is inclusive there).
      const slots = computeSlots(
        input({
          availabilityRules: [
            { weekday: 1, startTime: "00:00", endTime: "01:00" },
          ],
          eventType: evt({ durationMinutes: 30, slotGranularityMinutes: 15 }),
        }),
      );

      expect(starts(slots)).toEqual([
        "2026-07-06T00:00:00.000Z",
        "2026-07-06T00:15:00.000Z",
        "2026-07-06T00:30:00.000Z",
      ]);
      expect(slots[slots.length - 1].end.toISOString()).toBe(
        "2026-07-06T01:00:00.000Z",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Group F: determinism and defensive edges
  // ---------------------------------------------------------------------------
  describe("determinism and defensive edges", () => {
    it("generates slots with an empty busy array", () => {
      const slots = computeSlots(
        input({
          availabilityRules: [
            { weekday: 1, startTime: "09:00", endTime: "10:00" },
          ],
          busy: [],
        }),
      );
      expect(starts(slots)).toEqual([
        "2026-07-06T09:00:00.000Z",
        "2026-07-06T09:30:00.000Z",
      ]);
    });

    it("returns slots sorted ascending and free of duplicate starts", () => {
      // A duplicate Monday rule plus a Tuesday rule across a two-day range. The
      // duplicate must collapse, and the two days must come back ordered.
      const slots = computeSlots(
        input({
          rangeEnd: new Date("2026-07-08T00:00:00Z"),
          availabilityRules: [
            { weekday: 1, startTime: "09:00", endTime: "10:00" },
            { weekday: 1, startTime: "09:00", endTime: "10:00" },
            { weekday: 2, startTime: "09:00", endTime: "10:00" },
          ],
        }),
      );

      const iso = starts(slots);
      expect(iso).toEqual([
        "2026-07-06T09:00:00.000Z",
        "2026-07-06T09:30:00.000Z",
        "2026-07-07T09:00:00.000Z",
        "2026-07-07T09:30:00.000Z",
      ]);
      // Sorted ascending.
      expect(iso).toEqual([...iso].sort());
      // No duplicate starts.
      expect(new Set(iso).size).toBe(iso.length);
    });

    it("returns empty when rangeStart is not before rangeEnd", () => {
      expect(
        computeSlots(
          input({
            rangeStart: new Date("2026-07-06T00:00:00Z"),
            rangeEnd: new Date("2026-07-06T00:00:00Z"),
            availabilityRules: [
              { weekday: 1, startTime: "09:00", endTime: "10:00" },
            ],
          }),
        ),
      ).toEqual([]);

      expect(
        computeSlots(
          input({
            rangeStart: new Date("2026-07-07T00:00:00Z"),
            rangeEnd: new Date("2026-07-06T00:00:00Z"),
            availabilityRules: [
              { weekday: 1, startTime: "09:00", endTime: "10:00" },
            ],
          }),
        ),
      ).toEqual([]);
    });
  });
});
