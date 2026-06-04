import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closeDb, db } from "@/lib/db";
import {
  availabilityRules,
  hostSettings,
  noclucalUsers,
} from "@/lib/db/schema";
import {
  getHostSettings,
  listAvailabilityRulesForUser,
  replaceAvailabilityRulesForUser,
  upsertHostTimezone,
} from "@/lib/availability/queries";
import type { AvailabilityRuleInput } from "@/lib/availability/validation";

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

describe("availability queries", () => {
  beforeEach(async () => {
    await db.delete(availabilityRules);
    await db.delete(hostSettings);
    await db.delete(noclucalUsers);
    await seedUsers();
  });

  afterAll(async () => {
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
});
