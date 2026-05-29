import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { closeDb, db } from "@/lib/db";
import { calendarConnections, noclucalUsers } from "@/lib/db/schema";

const USER_ID = "01940000-0000-7000-8000-0000000000a1";

async function seedUser(): Promise<void> {
  await db.insert(noclucalUsers).values({
    id: USER_ID,
    username: "robert",
    displayName: "Robert",
  });
}

describe("calendar_connections schema", () => {
  beforeEach(async () => {
    // Cascade delete on user_id clears connections; delete both to be safe.
    await db.delete(calendarConnections);
    await db.delete(noclucalUsers);
    await seedUser();
  });

  afterAll(async () => {
    await db.delete(calendarConnections);
    await db.delete(noclucalUsers);
    await closeDb();
  });

  it("round-trips a row including the scopes text array", async () => {
    const expiresAt = new Date("2026-06-01T12:00:00.000Z");
    await db.insert(calendarConnections).values({
      userId: USER_ID,
      provider: "google",
      externalAccountId: "google-sub-123",
      externalAccountEmail: "robert@example.com",
      accessTokenCiphertext: "v1:placeholder:placeholder",
      refreshTokenCiphertext: "v1:placeholder:placeholder",
      tokenExpiresAt: expiresAt,
      scopes: [
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/calendar.readonly",
      ],
    });

    const rows = await db
      .select()
      .from(calendarConnections)
      .where(eq(calendarConnections.userId, USER_ID));

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.provider).toBe("google");
    expect(row.externalAccountId).toBe("google-sub-123");
    expect(row.externalAccountEmail).toBe("robert@example.com");
    expect(row.accessTokenCiphertext).toBe("v1:placeholder:placeholder");
    expect(row.refreshTokenCiphertext).toBe("v1:placeholder:placeholder");
    expect(row.tokenExpiresAt.toISOString()).toBe(expiresAt.toISOString());
    expect(row.scopes).toEqual([
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.readonly",
    ]);
    expect(row.connectedAt).toBeInstanceOf(Date);
    expect(row.lastSyncedAt).toBeNull();
  });

  it("rejects a second connection with the same (user_id, provider)", async () => {
    await db.insert(calendarConnections).values({
      userId: USER_ID,
      provider: "google",
      externalAccountId: "google-sub-123",
      externalAccountEmail: "robert@example.com",
      accessTokenCiphertext: "v1:placeholder:placeholder",
      refreshTokenCiphertext: "v1:placeholder:placeholder",
      tokenExpiresAt: new Date("2026-06-01T12:00:00.000Z"),
      scopes: ["https://www.googleapis.com/auth/calendar.events"],
    });

    // A different external account, so only the (user_id, provider) unique
    // index can fire, proving it is per-provider not per-account.
    await expect(
      db.insert(calendarConnections).values({
        userId: USER_ID,
        provider: "google",
        externalAccountId: "google-sub-456",
        externalAccountEmail: "robert.alt@example.com",
        accessTokenCiphertext: "v1:placeholder:placeholder",
        refreshTokenCiphertext: "v1:placeholder:placeholder",
        tokenExpiresAt: new Date("2026-06-01T12:00:00.000Z"),
        scopes: ["https://www.googleapis.com/auth/calendar.events"],
      }),
    ).rejects.toThrow();
  });

  it("allows a different provider for the same user", async () => {
    await db.insert(calendarConnections).values({
      userId: USER_ID,
      provider: "google",
      externalAccountId: "google-sub-123",
      externalAccountEmail: "robert@example.com",
      accessTokenCiphertext: "v1:placeholder:placeholder",
      refreshTokenCiphertext: "v1:placeholder:placeholder",
      tokenExpiresAt: new Date("2026-06-01T12:00:00.000Z"),
      scopes: ["https://www.googleapis.com/auth/calendar.events"],
    });

    await db.insert(calendarConnections).values({
      userId: USER_ID,
      provider: "microsoft",
      externalAccountId: "ms-oid-789",
      externalAccountEmail: "robert@example.com",
      accessTokenCiphertext: "v1:placeholder:placeholder",
      refreshTokenCiphertext: "v1:placeholder:placeholder",
      tokenExpiresAt: new Date("2026-06-01T12:00:00.000Z"),
      scopes: ["Calendars.ReadWrite"],
    });

    const rows = await db
      .select()
      .from(calendarConnections)
      .where(eq(calendarConnections.userId, USER_ID));

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.provider).sort()).toEqual(["google", "microsoft"]);
  });
});
