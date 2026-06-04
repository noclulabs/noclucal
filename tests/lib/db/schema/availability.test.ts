import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { closeDb, db } from "@/lib/db";
import {
  availabilityOverrides,
  availabilityRules,
  noclucalUsers,
} from "@/lib/db/schema";

const USER_ID = "01940000-0000-7000-8000-0000000000c1";

async function seedUser(): Promise<void> {
  await db.insert(noclucalUsers).values({
    id: USER_ID,
    username: "robert",
    displayName: "Robert",
  });
}

describe("availability schema", () => {
  beforeEach(async () => {
    // Cascade delete on user_id clears both tables; delete all to be safe.
    await db.delete(availabilityRules);
    await db.delete(availabilityOverrides);
    await db.delete(noclucalUsers);
    await seedUser();
  });

  afterAll(async () => {
    await db.delete(availabilityRules);
    await db.delete(availabilityOverrides);
    await db.delete(noclucalUsers);
    await closeDb();
  });

  describe("availability_rules", () => {
    it("round-trips a recurring weekly window", async () => {
      await db.insert(availabilityRules).values({
        userId: USER_ID,
        weekday: 1,
        startTime: "09:00:00",
        endTime: "17:00:00",
      });

      const rows = await db
        .select()
        .from(availabilityRules)
        .where(eq(availabilityRules.userId, USER_ID));

      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(row.weekday).toBe(1);
      expect(row.startTime).toBe("09:00:00");
      expect(row.endTime).toBe("17:00:00");
      expect(row.createdAt).toBeInstanceOf(Date);
      expect(row.updatedAt).toBeInstanceOf(Date);
    });

    it("allows two rows for the same (user_id, weekday) for split days", async () => {
      await db.insert(availabilityRules).values([
        {
          userId: USER_ID,
          weekday: 2,
          startTime: "09:00:00",
          endTime: "12:00:00",
        },
        {
          userId: USER_ID,
          weekday: 2,
          startTime: "13:00:00",
          endTime: "17:00:00",
        },
      ]);

      const rows = await db
        .select()
        .from(availabilityRules)
        .where(eq(availabilityRules.weekday, 2));
      expect(rows).toHaveLength(2);
    });

    it("rejects a weekday of 0 (below the ISO 1 to 7 range)", async () => {
      await expect(
        db.insert(availabilityRules).values({
          userId: USER_ID,
          weekday: 0,
          startTime: "09:00:00",
          endTime: "17:00:00",
        }),
      ).rejects.toThrow();
    });

    it("rejects a weekday of 8 (above the ISO 1 to 7 range)", async () => {
      await expect(
        db.insert(availabilityRules).values({
          userId: USER_ID,
          weekday: 8,
          startTime: "09:00:00",
          endTime: "17:00:00",
        }),
      ).rejects.toThrow();
    });

    it("rejects a window where start_time is not before end_time", async () => {
      await expect(
        db.insert(availabilityRules).values({
          userId: USER_ID,
          weekday: 3,
          startTime: "17:00:00",
          endTime: "09:00:00",
        }),
      ).rejects.toThrow();
    });
  });

  describe("availability_overrides", () => {
    it("inserts a blocked day (is_available false, null times)", async () => {
      await db.insert(availabilityOverrides).values({
        userId: USER_ID,
        date: "2026-12-25",
        isAvailable: false,
      });

      const rows = await db
        .select()
        .from(availabilityOverrides)
        .where(eq(availabilityOverrides.userId, USER_ID));

      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(row.date).toBe("2026-12-25");
      expect(row.isAvailable).toBe(false);
      expect(row.startTime).toBeNull();
      expect(row.endTime).toBeNull();
    });

    it("inserts a custom-hours day (is_available true, non-null times)", async () => {
      await db.insert(availabilityOverrides).values({
        userId: USER_ID,
        date: "2026-12-31",
        isAvailable: true,
        startTime: "10:00:00",
        endTime: "14:00:00",
      });

      const rows = await db
        .select()
        .from(availabilityOverrides)
        .where(eq(availabilityOverrides.date, "2026-12-31"));

      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(row.isAvailable).toBe(true);
      expect(row.startTime).toBe("10:00:00");
      expect(row.endTime).toBe("14:00:00");
    });

    it("rejects is_available false with non-null times", async () => {
      await expect(
        db.insert(availabilityOverrides).values({
          userId: USER_ID,
          date: "2026-12-25",
          isAvailable: false,
          startTime: "10:00:00",
          endTime: "14:00:00",
        }),
      ).rejects.toThrow();
    });

    it("rejects is_available true with null times", async () => {
      await expect(
        db.insert(availabilityOverrides).values({
          userId: USER_ID,
          date: "2026-12-31",
          isAvailable: true,
        }),
      ).rejects.toThrow();
    });
  });

  it("cascade deletes rules and overrides when the user is removed", async () => {
    await db.insert(availabilityRules).values({
      userId: USER_ID,
      weekday: 4,
      startTime: "09:00:00",
      endTime: "17:00:00",
    });
    await db.insert(availabilityOverrides).values({
      userId: USER_ID,
      date: "2026-12-25",
      isAvailable: false,
    });

    await db.delete(noclucalUsers).where(eq(noclucalUsers.id, USER_ID));

    const rules = await db
      .select()
      .from(availabilityRules)
      .where(eq(availabilityRules.userId, USER_ID));
    const overrides = await db
      .select()
      .from(availabilityOverrides)
      .where(eq(availabilityOverrides.userId, USER_ID));
    expect(rules).toHaveLength(0);
    expect(overrides).toHaveLength(0);
  });
});
