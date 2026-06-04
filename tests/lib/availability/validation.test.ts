import { describe, expect, it } from "vitest";
import {
  availabilityRuleSchema,
  weeklyScheduleSchema,
  timezoneSchema,
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
