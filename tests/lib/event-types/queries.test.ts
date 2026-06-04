import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closeDb, db } from "@/lib/db";
import { eventTypes, noclucalUsers } from "@/lib/db/schema";
import {
  SlugConflictError,
  createEventType,
  deleteEventType,
  getEventType,
  listEventTypesForUser,
  updateEventType,
} from "@/lib/event-types/queries";
import type { EventTypeInput } from "@/lib/event-types/validation";

const USER_A = "01940000-0000-7000-8000-0000000000a1";
const USER_B = "01940000-0000-7000-8000-0000000000b2";
const MISSING_ID = "01940000-0000-7000-8000-0000dead0000";

function makeInput(overrides: Partial<EventTypeInput> = {}): EventTypeInput {
  return {
    name: "Intro call",
    slug: "intro-call",
    description: null,
    durationMinutes: 30,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    minNoticeMinutes: 0,
    maxFutureMinutes: 86400,
    slotGranularityMinutes: 15,
    color: "indigo",
    enabled: true,
    ...overrides,
  };
}

async function seedUsers(): Promise<void> {
  await db.insert(noclucalUsers).values([
    { id: USER_A, username: "alice", displayName: "Alice" },
    { id: USER_B, username: "bob", displayName: "Bob" },
  ]);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("event type queries", () => {
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

  describe("createEventType / getEventType", () => {
    it("creates a row and reads it back scoped to the owner", async () => {
      const created = await createEventType(
        USER_A,
        makeInput({ name: "Intro call", slug: "intro-call", color: "sky" }),
      );
      expect(created.userId).toBe(USER_A);
      expect(created.name).toBe("Intro call");
      expect(created.slug).toBe("intro-call");
      expect(created.color).toBe("sky");

      const fetched = await getEventType({ userId: USER_A, id: created.id });
      expect(fetched?.id).toBe(created.id);
      expect(fetched?.slug).toBe("intro-call");
    });

    it("persists a null description", async () => {
      const created = await createEventType(
        USER_A,
        makeInput({ description: null }),
      );
      expect(created.description).toBeNull();
    });

    it("returns null when reading another user's event type by id", async () => {
      const created = await createEventType(USER_A, makeInput());
      const asOther = await getEventType({ userId: USER_B, id: created.id });
      expect(asOther).toBeNull();
    });

    it("returns null when the id does not exist", async () => {
      const result = await getEventType({ userId: USER_A, id: MISSING_ID });
      expect(result).toBeNull();
    });

    it("throws SlugConflictError on a duplicate (userId, slug)", async () => {
      await createEventType(USER_A, makeInput({ slug: "intro-call" }));
      await expect(
        createEventType(USER_A, makeInput({ slug: "intro-call" })),
      ).rejects.toBeInstanceOf(SlugConflictError);
    });

    it("allows the same slug for a different user", async () => {
      await createEventType(USER_A, makeInput({ slug: "intro-call" }));
      const forB = await createEventType(
        USER_B,
        makeInput({ slug: "intro-call" }),
      );
      expect(forB.userId).toBe(USER_B);
      expect(forB.slug).toBe("intro-call");
    });
  });

  describe("listEventTypesForUser", () => {
    it("orders by createdAt ascending and isolates by user", async () => {
      await createEventType(USER_A, makeInput({ name: "First", slug: "first" }));
      await sleep(5);
      await createEventType(USER_A, makeInput({ name: "Second", slug: "second" }));
      await sleep(5);
      await createEventType(USER_A, makeInput({ name: "Third", slug: "third" }));
      await createEventType(USER_B, makeInput({ name: "B only", slug: "b-only" }));

      const listA = await listEventTypesForUser(USER_A);
      expect(listA.map((e) => e.slug)).toEqual(["first", "second", "third"]);

      const listB = await listEventTypesForUser(USER_B);
      expect(listB.map((e) => e.slug)).toEqual(["b-only"]);
    });

    it("returns an empty array for a user with no event types", async () => {
      const list = await listEventTypesForUser(USER_A);
      expect(list).toEqual([]);
    });
  });

  describe("updateEventType", () => {
    it("updates fields scoped to the owner", async () => {
      const created = await createEventType(
        USER_A,
        makeInput({ name: "Intro", slug: "intro", durationMinutes: 30 }),
      );

      const updated = await updateEventType(
        { userId: USER_A, id: created.id },
        makeInput({
          name: "Renamed",
          slug: "renamed",
          durationMinutes: 45,
          color: "emerald",
          enabled: false,
        }),
      );
      expect(updated?.name).toBe("Renamed");
      expect(updated?.slug).toBe("renamed");
      expect(updated?.durationMinutes).toBe(45);
      expect(updated?.color).toBe("emerald");
      expect(updated?.enabled).toBe(false);
    });

    it("returns null and changes nothing when updating another user's id", async () => {
      const created = await createEventType(
        USER_A,
        makeInput({ name: "Intro", slug: "intro" }),
      );

      const result = await updateEventType(
        { userId: USER_B, id: created.id },
        makeInput({ name: "Hijacked", slug: "hijacked" }),
      );
      expect(result).toBeNull();

      const untouched = await getEventType({ userId: USER_A, id: created.id });
      expect(untouched?.name).toBe("Intro");
      expect(untouched?.slug).toBe("intro");
    });

    it("throws SlugConflictError when updating onto an existing slug", async () => {
      await createEventType(USER_A, makeInput({ slug: "taken" }));
      const other = await createEventType(USER_A, makeInput({ slug: "free" }));

      await expect(
        updateEventType(
          { userId: USER_A, id: other.id },
          makeInput({ slug: "taken" }),
        ),
      ).rejects.toBeInstanceOf(SlugConflictError);
    });
  });

  describe("deleteEventType", () => {
    it("returns true then false on a repeat delete", async () => {
      const created = await createEventType(USER_A, makeInput());
      expect(await deleteEventType({ userId: USER_A, id: created.id })).toBe(true);
      expect(await deleteEventType({ userId: USER_A, id: created.id })).toBe(false);
    });

    it("cannot delete another user's event type", async () => {
      const created = await createEventType(USER_A, makeInput());
      expect(await deleteEventType({ userId: USER_B, id: created.id })).toBe(false);

      const stillThere = await getEventType({ userId: USER_A, id: created.id });
      expect(stillThere?.id).toBe(created.id);
    });
  });
});
