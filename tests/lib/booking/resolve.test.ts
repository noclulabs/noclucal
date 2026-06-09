import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closeDb, db } from "@/lib/db";
import { eventTypes, noclucalUsers } from "@/lib/db/schema";
import { resolvePublicEventType } from "@/lib/booking/resolve";

const USER_A = "01940000-0000-7000-8000-0000000000a1";
const USER_B = "01940000-0000-7000-8000-0000000000b2";

async function seedUsers(): Promise<void> {
  await db.insert(noclucalUsers).values([
    { id: USER_A, username: "alice", displayName: "Alice" },
    { id: USER_B, username: "bob", displayName: "Bob" },
  ]);
}

async function seedEventType(
  userId: string,
  overrides: Partial<typeof eventTypes.$inferInsert> = {},
): Promise<typeof eventTypes.$inferSelect> {
  const [row] = await db
    .insert(eventTypes)
    .values({
      userId,
      name: "Intro call",
      slug: "intro-call",
      durationMinutes: 30,
      enabled: true,
      ...overrides,
    })
    .returning();
  return row;
}

describe("resolvePublicEventType", () => {
  beforeEach(async () => {
    await db.delete(eventTypes);
    await db.delete(noclucalUsers);
    await seedUsers();
  });

  afterAll(async () => {
    await db.delete(eventTypes);
    await db.delete(noclucalUsers);
    await closeDb();
  });

  it("resolves a valid (username, slug) with an enabled event type", async () => {
    const et = await seedEventType(USER_A, { slug: "intro-call" });

    const resolved = await resolvePublicEventType({
      username: "alice",
      slug: "intro-call",
    });

    expect(resolved?.hostUserId).toBe(USER_A);
    expect(resolved?.eventType.id).toBe(et.id);
    expect(resolved?.eventType.slug).toBe("intro-call");
  });

  it("matches the username case-insensitively (citext)", async () => {
    await seedEventType(USER_A, { slug: "intro-call" });

    const resolved = await resolvePublicEventType({
      username: "Alice",
      slug: "intro-call",
    });

    expect(resolved?.hostUserId).toBe(USER_A);
  });

  it("returns null for an unknown username", async () => {
    await seedEventType(USER_A, { slug: "intro-call" });

    const resolved = await resolvePublicEventType({
      username: "nobody",
      slug: "intro-call",
    });

    expect(resolved).toBeNull();
  });

  it("returns null for an unknown slug under a real user", async () => {
    await seedEventType(USER_A, { slug: "intro-call" });

    const resolved = await resolvePublicEventType({
      username: "alice",
      slug: "does-not-exist",
    });

    expect(resolved).toBeNull();
  });

  it("returns null for a disabled event type", async () => {
    await seedEventType(USER_A, { slug: "intro-call", enabled: false });

    const resolved = await resolvePublicEventType({
      username: "alice",
      slug: "intro-call",
    });

    expect(resolved).toBeNull();
  });

  it("scopes resolution per user when two users share a slug", async () => {
    const aEt = await seedEventType(USER_A, {
      slug: "intro-call",
      name: "Alice intro",
    });
    const bEt = await seedEventType(USER_B, {
      slug: "intro-call",
      name: "Bob intro",
    });

    const a = await resolvePublicEventType({
      username: "alice",
      slug: "intro-call",
    });
    const b = await resolvePublicEventType({
      username: "bob",
      slug: "intro-call",
    });

    expect(a?.hostUserId).toBe(USER_A);
    expect(a?.eventType.id).toBe(aEt.id);
    expect(b?.hostUserId).toBe(USER_B);
    expect(b?.eventType.id).toBe(bEt.id);
  });
});
