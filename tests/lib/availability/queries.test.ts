import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closeDb, db } from "@/lib/db";
import {
  availabilityOverrides,
  availabilityRules,
  hostSettings,
  noclucalUsers,
} from "@/lib/db/schema";
import {
  getHostSettings,
  listAvailabilityRulesForUser,
  replaceAvailabilityRulesForUser,
  upsertHostTimezone,
  listAvailabilityOverridesForUser,
  setDateOverrideForUser,
  deleteDateOverrideForUser,
} from "@/lib/availability/queries";
import type {
  AvailabilityRuleInput,
  DateOverrideInput,
} from "@/lib/availability/validation";

const USER_A = "01940000-0000-7000-8000-0000000000a1";
const USER_B = "01940000-0000-7000-8000-0000000000b2";

async function seedUsers(): Promise<void> {
  await db.insert(noclucalUsers).values([
    { id: USER_A, username: "alice", displayName: "Alice" },
    { id: USER_B, username: "bob", displayName: "Bob" },
  ]);
}

/** Truncate the "HH:MM:SS" the time column returns back to "HH:MM". */
function hm(value: string): string {
  return value.slice(0, 5);
}

const rule = (
  weekday: number,
  startTime: string,
  endTime: string,
): AvailabilityRuleInput => ({ weekday, startTime, endTime });

const blockedOverride = (date: string): DateOverrideInput => ({
  date,
  blocked: true,
  ranges: [],
});

const customOverride = (
  date: string,
  ranges: { startTime: string; endTime: string }[],
): DateOverrideInput => ({ date, blocked: false, ranges });

describe("availability queries", () => {
  beforeEach(async () => {
    await db.delete(availabilityOverrides);
    await db.delete(availabilityRules);
    await db.delete(hostSettings);
    await db.delete(noclucalUsers);
    await seedUsers();
  });

  afterAll(async () => {
    await db.delete(availabilityOverrides);
    await db.delete(availabilityRules);
    await db.delete(hostSettings);
    await db.delete(noclucalUsers);
    await closeDb();
  });

  describe("replaceAvailabilityRulesForUser", () => {
    it("inserts a fresh set of rules", async () => {
      await replaceAvailabilityRulesForUser(USER_A, [
        rule(1, "09:00", "12:00"),
        rule(1, "13:00", "17:00"),
      ]);

      const list = await listAvailabilityRulesForUser(USER_A);
      expect(list).toHaveLength(2);
      expect(
        list.map((r) => [r.weekday, hm(r.startTime), hm(r.endTime)]),
      ).toEqual([
        [1, "09:00", "12:00"],
        [1, "13:00", "17:00"],
      ]);
    });

    it("replaces the previous set on a second save", async () => {
      await replaceAvailabilityRulesForUser(USER_A, [
        rule(1, "09:00", "17:00"),
        rule(2, "09:00", "17:00"),
      ]);
      await replaceAvailabilityRulesForUser(USER_A, [rule(5, "10:00", "14:00")]);

      const list = await listAvailabilityRulesForUser(USER_A);
      expect(list).toHaveLength(1);
      expect(list[0].weekday).toBe(5);
      expect(hm(list[0].startTime)).toBe("10:00");
      expect(hm(list[0].endTime)).toBe("14:00");
    });

    it("clears all rules when given an empty array", async () => {
      await replaceAvailabilityRulesForUser(USER_A, [rule(1, "09:00", "17:00")]);
      await replaceAvailabilityRulesForUser(USER_A, []);

      const list = await listAvailabilityRulesForUser(USER_A);
      expect(list).toEqual([]);
    });

    it("isolates rules per user", async () => {
      await replaceAvailabilityRulesForUser(USER_A, [rule(1, "09:00", "17:00")]);
      await replaceAvailabilityRulesForUser(USER_B, [
        rule(2, "08:00", "10:00"),
        rule(3, "08:00", "10:00"),
      ]);

      // Replacing A again must not touch B.
      await replaceAvailabilityRulesForUser(USER_A, [rule(4, "11:00", "12:00")]);

      const listA = await listAvailabilityRulesForUser(USER_A);
      const listB = await listAvailabilityRulesForUser(USER_B);
      expect(listA.map((r) => r.weekday)).toEqual([4]);
      expect(listB.map((r) => r.weekday)).toEqual([2, 3]);
    });
  });

  describe("listAvailabilityRulesForUser", () => {
    it("orders by weekday then start time", async () => {
      await replaceAvailabilityRulesForUser(USER_A, [
        rule(3, "10:00", "11:00"),
        rule(1, "13:00", "17:00"),
        rule(1, "09:00", "12:00"),
      ]);

      const list = await listAvailabilityRulesForUser(USER_A);
      expect(
        list.map((r) => [r.weekday, hm(r.startTime)]),
      ).toEqual([
        [1, "09:00"],
        [1, "13:00"],
        [3, "10:00"],
      ]);
    });

    it("returns an empty array for a user with no rules", async () => {
      expect(await listAvailabilityRulesForUser(USER_A)).toEqual([]);
    });
  });

  describe("getHostSettings / upsertHostTimezone", () => {
    it("returns null before any save, then the saved row", async () => {
      expect(await getHostSettings(USER_A)).toBeNull();

      await upsertHostTimezone(USER_A, "America/New_York");
      const settings = await getHostSettings(USER_A);
      expect(settings?.userId).toBe(USER_A);
      expect(settings?.timezone).toBe("America/New_York");
    });

    it("updates the same row on a second upsert", async () => {
      await upsertHostTimezone(USER_A, "America/New_York");
      await upsertHostTimezone(USER_A, "Europe/London");

      const rows = await db.select().from(hostSettings);
      expect(rows).toHaveLength(1);
      expect(rows[0].userId).toBe(USER_A);
      expect(rows[0].timezone).toBe("Europe/London");
    });

    it("scopes the timezone per user", async () => {
      await upsertHostTimezone(USER_A, "America/Los_Angeles");
      await upsertHostTimezone(USER_B, "Asia/Tokyo");

      expect((await getHostSettings(USER_A))?.timezone).toBe(
        "America/Los_Angeles",
      );
      expect((await getHostSettings(USER_B))?.timezone).toBe("Asia/Tokyo");
    });
  });

  describe("setDateOverrideForUser", () => {
    it("writes a single blocked row with null times", async () => {
      await setDateOverrideForUser(USER_A, blockedOverride("2026-12-25"));

      const list = await listAvailabilityOverridesForUser(USER_A);
      expect(list).toHaveLength(1);
      expect(list[0].date).toBe("2026-12-25");
      expect(list[0].isAvailable).toBe(false);
      expect(list[0].startTime).toBeNull();
      expect(list[0].endTime).toBeNull();
    });

    it("writes one row per range for a custom-hours day", async () => {
      await setDateOverrideForUser(
        USER_A,
        customOverride("2026-12-24", [
          { startTime: "09:00", endTime: "12:00" },
          { startTime: "13:00", endTime: "17:00" },
        ]),
      );

      const list = await listAvailabilityOverridesForUser(USER_A);
      expect(list).toHaveLength(2);
      expect(
        list.map((r) => [hm(r.startTime!), hm(r.endTime!), r.isAvailable]),
      ).toEqual([
        ["09:00", "12:00", true],
        ["13:00", "17:00", true],
      ]);
    });

    it("replaces the prior rows when the same date is set again", async () => {
      await setDateOverrideForUser(
        USER_A,
        customOverride("2026-12-24", [{ startTime: "09:00", endTime: "12:00" }]),
      );
      await setDateOverrideForUser(
        USER_A,
        customOverride("2026-12-24", [
          { startTime: "10:00", endTime: "11:00" },
          { startTime: "14:00", endTime: "15:00" },
        ]),
      );

      const list = await listAvailabilityOverridesForUser(USER_A);
      expect(list).toHaveLength(2);
      expect(list.map((r) => [hm(r.startTime!), hm(r.endTime!)])).toEqual([
        ["10:00", "11:00"],
        ["14:00", "15:00"],
      ]);
    });

    it("replaces a custom day with a block on a second set", async () => {
      await setDateOverrideForUser(
        USER_A,
        customOverride("2026-12-24", [{ startTime: "09:00", endTime: "17:00" }]),
      );
      await setDateOverrideForUser(USER_A, blockedOverride("2026-12-24"));

      const list = await listAvailabilityOverridesForUser(USER_A);
      expect(list).toHaveLength(1);
      expect(list[0].isAvailable).toBe(false);
      expect(list[0].startTime).toBeNull();
    });

    it("isolates overrides per user", async () => {
      await setDateOverrideForUser(USER_A, blockedOverride("2026-12-25"));
      await setDateOverrideForUser(
        USER_B,
        customOverride("2026-12-25", [{ startTime: "08:00", endTime: "10:00" }]),
      );

      // Re-setting A's same date must not touch B.
      await setDateOverrideForUser(
        USER_A,
        customOverride("2026-12-25", [{ startTime: "11:00", endTime: "12:00" }]),
      );

      const listA = await listAvailabilityOverridesForUser(USER_A);
      const listB = await listAvailabilityOverridesForUser(USER_B);
      expect(listA).toHaveLength(1);
      expect(hm(listA[0].startTime!)).toBe("11:00");
      expect(listB).toHaveLength(1);
      expect(hm(listB[0].startTime!)).toBe("08:00");
    });
  });

  describe("deleteDateOverrideForUser", () => {
    it("removes every row for the date, returning true then false", async () => {
      await setDateOverrideForUser(
        USER_A,
        customOverride("2026-12-24", [
          { startTime: "09:00", endTime: "12:00" },
          { startTime: "13:00", endTime: "17:00" },
        ]),
      );

      expect(await deleteDateOverrideForUser(USER_A, "2026-12-24")).toBe(true);
      expect(await listAvailabilityOverridesForUser(USER_A)).toEqual([]);
      expect(await deleteDateOverrideForUser(USER_A, "2026-12-24")).toBe(false);
    });

    it("does not delete another user's override on the same date", async () => {
      await setDateOverrideForUser(USER_A, blockedOverride("2026-12-25"));
      await setDateOverrideForUser(USER_B, blockedOverride("2026-12-25"));

      expect(await deleteDateOverrideForUser(USER_A, "2026-12-25")).toBe(true);
      expect(await listAvailabilityOverridesForUser(USER_B)).toHaveLength(1);
    });
  });

  describe("listAvailabilityOverridesForUser", () => {
    it("orders rows by date then start time", async () => {
      await setDateOverrideForUser(
        USER_A,
        customOverride("2026-12-26", [{ startTime: "10:00", endTime: "11:00" }]),
      );
      await setDateOverrideForUser(
        USER_A,
        customOverride("2026-12-24", [
          { startTime: "13:00", endTime: "14:00" },
          { startTime: "09:00", endTime: "10:00" },
        ]),
      );

      const list = await listAvailabilityOverridesForUser(USER_A);
      expect(list.map((r) => [r.date, hm(r.startTime!)])).toEqual([
        ["2026-12-24", "09:00"],
        ["2026-12-24", "13:00"],
        ["2026-12-26", "10:00"],
      ]);
    });

    it("returns an empty array for a user with no overrides", async () => {
      expect(await listAvailabilityOverridesForUser(USER_A)).toEqual([]);
    });
  });
});
