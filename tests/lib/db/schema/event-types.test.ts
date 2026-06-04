import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { closeDb, db } from "@/lib/db";
import { eventTypes, noclucalUsers } from "@/lib/db/schema";

const USER_ID = "01940000-0000-7000-8000-0000000000b1";
const OTHER_USER_ID = "01940000-0000-7000-8000-0000000000b2";

async function seedUsers(): Promise<void> {
  await db.insert(noclucalUsers).values([
    { id: USER_ID, username: "robert", displayName: "Robert" },
    { id: OTHER_USER_ID, username: "alex", displayName: "Alex" },
  ]);
}

describe("event_types schema", () => {
  beforeEach(async () => {
    // Cascade delete on user_id clears event types; delete both to be safe.
    await db.delete(eventTypes);
    await db.delete(noclucalUsers);
    await seedUsers();
  });

  afterAll(async () => {
    await db.delete(eventTypes);
    await db.delete(noclucalUsers);
    await closeDb();
  });

  it("round-trips a row including the explicit columns", async () => {
    await db.insert(eventTypes).values({
      userId: USER_ID,
      name: "Intro call",
      slug: "intro-call",
      description: "A short intro",
      durationMinutes: 30,
      bufferBeforeMinutes: 5,
      bufferAfterMinutes: 10,
      minNoticeMinutes: 120,
      maxFutureMinutes: 43200,
      slotGranularityMinutes: 30,
      color: "sky",
      enabled: false,
    });

    const rows = await db
      .select()
      .from(eventTypes)
      .where(eq(eventTypes.userId, USER_ID));

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.name).toBe("Intro call");
    expect(row.slug).toBe("intro-call");
    expect(row.description).toBe("A short intro");
    expect(row.durationMinutes).toBe(30);
    expect(row.bufferBeforeMinutes).toBe(5);
    expect(row.bufferAfterMinutes).toBe(10);
    expect(row.minNoticeMinutes).toBe(120);
    expect(row.maxFutureMinutes).toBe(43200);
    expect(row.slotGranularityMinutes).toBe(30);
    expect(row.color).toBe("sky");
    expect(row.enabled).toBe(false);
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.updatedAt).toBeInstanceOf(Date);
  });

  it("applies column defaults when omitted", async () => {
    await db.insert(eventTypes).values({
      userId: USER_ID,
      name: "Quick chat",
      slug: "quick-chat",
      durationMinutes: 15,
    });

    const rows = await db
      .select()
      .from(eventTypes)
      .where(eq(eventTypes.userId, USER_ID));

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.description).toBeNull();
    expect(row.bufferBeforeMinutes).toBe(0);
    expect(row.bufferAfterMinutes).toBe(0);
    expect(row.minNoticeMinutes).toBe(0);
    expect(row.maxFutureMinutes).toBe(86400);
    expect(row.slotGranularityMinutes).toBe(15);
    expect(row.color).toBe("indigo");
    expect(row.enabled).toBe(true);
  });

  it("rejects a duplicate (user_id, slug)", async () => {
    await db.insert(eventTypes).values({
      userId: USER_ID,
      name: "Intro call",
      slug: "intro-call",
      durationMinutes: 30,
    });

    await expect(
      db.insert(eventTypes).values({
        userId: USER_ID,
        name: "Another intro",
        slug: "intro-call",
        durationMinutes: 45,
      }),
    ).rejects.toThrow();
  });

  it("allows the same slug for a different user", async () => {
    await db.insert(eventTypes).values({
      userId: USER_ID,
      name: "Intro call",
      slug: "intro-call",
      durationMinutes: 30,
    });

    await db.insert(eventTypes).values({
      userId: OTHER_USER_ID,
      name: "Intro call",
      slug: "intro-call",
      durationMinutes: 30,
    });

    const rows = await db.select().from(eventTypes);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.userId).sort()).toEqual(
      [USER_ID, OTHER_USER_ID].sort(),
    );
  });

  it("cascade deletes event types when the user is removed", async () => {
    await db.insert(eventTypes).values({
      userId: USER_ID,
      name: "Intro call",
      slug: "intro-call",
      durationMinutes: 30,
    });

    await db.delete(noclucalUsers).where(eq(noclucalUsers.id, USER_ID));

    const rows = await db
      .select()
      .from(eventTypes)
      .where(eq(eventTypes.userId, USER_ID));
    expect(rows).toHaveLength(0);
  });
});
