import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { closeDb, db } from "@/lib/db";
import { hostSettings, noclucalUsers } from "@/lib/db/schema";

const USER_ID = "01940000-0000-7000-8000-0000000000d1";

async function seedUser(): Promise<void> {
  await db.insert(noclucalUsers).values({
    id: USER_ID,
    username: "robert",
    displayName: "Robert",
  });
}

describe("host_settings schema", () => {
  beforeEach(async () => {
    // Cascade delete on user_id clears host settings; delete both to be safe.
    await db.delete(hostSettings);
    await db.delete(noclucalUsers);
    await seedUser();
  });

  afterAll(async () => {
    await db.delete(hostSettings);
    await db.delete(noclucalUsers);
    await closeDb();
  });

  it("round-trips a row with an explicit timezone", async () => {
    await db.insert(hostSettings).values({
      userId: USER_ID,
      timezone: "Europe/Berlin",
    });

    const rows = await db
      .select()
      .from(hostSettings)
      .where(eq(hostSettings.userId, USER_ID));

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.timezone).toBe("Europe/Berlin");
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.updatedAt).toBeInstanceOf(Date);
  });

  it("applies the default timezone when omitted", async () => {
    await db.insert(hostSettings).values({ userId: USER_ID });

    const rows = await db
      .select()
      .from(hostSettings)
      .where(eq(hostSettings.userId, USER_ID));

    expect(rows).toHaveLength(1);
    expect(rows[0].timezone).toBe("America/Los_Angeles");
  });

  it("rejects a second row for the same user (PK conflict)", async () => {
    await db.insert(hostSettings).values({ userId: USER_ID });

    await expect(
      db.insert(hostSettings).values({
        userId: USER_ID,
        timezone: "Europe/Berlin",
      }),
    ).rejects.toThrow();
  });

  it("cascade deletes host settings when the user is removed", async () => {
    await db.insert(hostSettings).values({ userId: USER_ID });

    await db.delete(noclucalUsers).where(eq(noclucalUsers.id, USER_ID));

    const rows = await db
      .select()
      .from(hostSettings)
      .where(eq(hostSettings.userId, USER_ID));
    expect(rows).toHaveLength(0);
  });
});
