import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closeDb, db } from "@/lib/db";
import { noclucalUsers } from "@/lib/db/schema";
import { upsertNoclucalUser } from "@/lib/auth/upsert-noclucal-user";

describe("upsertNoclucalUser", () => {
  beforeEach(async () => {
    await db.delete(noclucalUsers);
  });

  afterAll(async () => {
    await closeDb();
  });

  it("inserts a new row on first observation", async () => {
    await upsertNoclucalUser({
      id: "01940000-0000-7000-8000-000000000001",
      username: "robert",
      displayName: "Robert",
    });

    const rows = await db.select().from(noclucalUsers);
    expect(rows).toHaveLength(1);
    expect(rows[0].username).toBe("robert");
    expect(rows[0].displayName).toBe("Robert");
  });

  it("updates an existing row on subsequent observation", async () => {
    const id = "01940000-0000-7000-8000-000000000001";
    await upsertNoclucalUser({ id, username: "robert", displayName: "Robert" });
    await upsertNoclucalUser({
      id,
      username: "robert",
      displayName: "Robert (renamed)",
    });

    const rows = await db.select().from(noclucalUsers);
    expect(rows).toHaveLength(1);
    expect(rows[0].displayName).toBe("Robert (renamed)");
  });

  it("treats undefined displayName as null", async () => {
    await upsertNoclucalUser({
      id: "01940000-0000-7000-8000-000000000002",
      username: "anon",
    });

    const rows = await db.select().from(noclucalUsers);
    expect(rows[0].displayName).toBeNull();
  });
});
