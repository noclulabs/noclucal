import { describe, expect, it } from "vitest";
import {
  availabilityRuleSchema,
  weeklyScheduleSchema,
  timezoneSchema,
  dateOverrideInputSchema,
} from "@/lib/availability/validation";

describe("availabilityRuleSchema", () => {
  it("accepts a well-formed rule", () => {
    const result = availabilityRuleSchema.safeParse({
      weekday: 1,
      startTime: "09:00",
      endTime: "17:00",
    });
    expect(result.success).toBe(true);
  });

  it("coerces a numeric-string weekday (as posted by the editor JSON)", () => {
    const result = availabilityRuleSchema.safeParse({
      weekday: "3",
      startTime: "09:00",
      endTime: "12:00",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.weekday).toBe(3);
  });

  it("rejects a weekday below 1", () => {
    const result = availabilityRuleSchema.safeParse({
      weekday: 0,
      startTime: "09:00",
      endTime: "17:00",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a weekday above 7", () => {
    const result = availabilityRuleSchema.safeParse({
      weekday: 8,
      startTime: "09:00",
      endTime: "17:00",
    });
    expect(result.success).toBe(false);
  });

  it("rejects malformed times", () => {
    for (const time of ["9:00", "24:00", "12:60", "noon", "12:0", ""]) {
      const result = availabilityRuleSchema.safeParse({
        weekday: 1,
        startTime: time,
        endTime: "17:00",
      });
      expect(result.success, time).toBe(false);
    }
  });

  it("rejects an end that is not after the start", () => {
    const equal = availabilityRuleSchema.safeParse({
      weekday: 1,
      startTime: "09:00",
      endTime: "09:00",
    });
    expect(equal.success).toBe(false);
    if (!equal.success) {
      expect(equal.error.issues[0].path).toEqual(["endTime"]);
    }

    const reversed = availabilityRuleSchema.safeParse({
      weekday: 1,
      startTime: "17:00",
      endTime: "09:00",
    });
    expect(reversed.success).toBe(false);
  });
});

describe("weeklyScheduleSchema", () => {
  it("accepts an empty rules array (a fully cleared schedule)", () => {
    const result = weeklyScheduleSchema.safeParse({ rules: [] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.rules).toEqual([]);
  });

  it("accepts multiple rules including a split day", () => {
    const result = weeklyScheduleSchema.safeParse({
      rules: [
        { weekday: 1, startTime: "09:00", endTime: "12:00" },
        { weekday: 1, startTime: "13:00", endTime: "17:00" },
        { weekday: 3, startTime: "10:00", endTime: "16:00" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects the whole schedule when any rule is invalid", () => {
    const result = weeklyScheduleSchema.safeParse({
      rules: [
        { weekday: 1, startTime: "09:00", endTime: "12:00" },
        { weekday: 2, startTime: "17:00", endTime: "09:00" },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe("timezoneSchema", () => {
  it("accepts a real IANA zone", () => {
    expect(timezoneSchema.safeParse("America/Los_Angeles").success).toBe(true);
    expect(timezoneSchema.safeParse("Europe/London").success).toBe(true);
  });

  it("rejects a junk string", () => {
    expect(timezoneSchema.safeParse("Mars/Phobos").success).toBe(false);
    expect(timezoneSchema.safeParse("not-a-zone").success).toBe(false);
    expect(timezoneSchema.safeParse("").success).toBe(false);
  });
});

describe("dateOverrideInputSchema", () => {
  it("accepts a blocked day with no ranges", () => {
    const result = dateOverrideInputSchema.safeParse({
      date: "2026-12-25",
      blocked: true,
      ranges: [],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a custom day with one range", () => {
    const result = dateOverrideInputSchema.safeParse({
      date: "2026-12-24",
      blocked: false,
      ranges: [{ startTime: "10:00", endTime: "14:00" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a custom day with multiple (split) ranges", () => {
    const result = dateOverrideInputSchema.safeParse({
      date: "2026-12-24",
      blocked: false,
      ranges: [
        { startTime: "09:00", endTime: "12:00" },
        { startTime: "13:00", endTime: "17:00" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a blocked day that still carries ranges", () => {
    const result = dateOverrideInputSchema.safeParse({
      date: "2026-12-25",
      blocked: true,
      ranges: [{ startTime: "09:00", endTime: "17:00" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["ranges"]);
    }
  });

  it("rejects an available day with no ranges", () => {
    const result = dateOverrideInputSchema.safeParse({
      date: "2026-12-24",
      blocked: false,
      ranges: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["ranges"]);
    }
  });

  it("rejects a custom range whose end is not after its start", () => {
    const result = dateOverrideInputSchema.safeParse({
      date: "2026-12-24",
      blocked: false,
      ranges: [{ startTime: "17:00", endTime: "09:00" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed date", () => {
    for (const date of ["2026-1-1", "12/25/2026", "2026/12/25", "today", ""]) {
      const result = dateOverrideInputSchema.safeParse({
        date,
        blocked: true,
        ranges: [],
      });
      expect(result.success, date).toBe(false);
    }
  });

  it("rejects an impossible date that matches the shape", () => {
    const result = dateOverrideInputSchema.safeParse({
      date: "2026-13-40",
      blocked: true,
      ranges: [],
    });
    expect(result.success).toBe(false);
  });
});
