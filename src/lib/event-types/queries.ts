import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { EventTypeRow } from "@/lib/db/schema/event-types";
import type { EventTypeInput } from "./validation";

/**
 * Thrown by `createEventType` and `updateEventType` when the requested slug
 * collides with an existing event type for the same user. Maps the Postgres
 * unique-violation (23505) on `event_types_user_slug_unique` to a friendly
 * field error instead of letting a raw DB error surface as a 500.
 */
export class SlugConflictError extends Error {
  constructor() {
    super("An event type with that slug already exists");
    this.name = "SlugConflictError";
  }
}

// Drizzle wraps a failing query in an error whose `cause` is the underlying
// pg error; the SQLSTATE `code` (23505 for a unique violation) lives on that
// cause. Walk the cause chain so the check works whether the code is on the
// thrown error or one nested below it.
function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current !== null && current !== undefined; depth++) {
    if (
      typeof current === "object" &&
      "code" in current &&
      (current as { code?: string }).code === "23505"
    ) {
      return true;
    }
    current =
      typeof current === "object" && "cause" in current
        ? (current as { cause?: unknown }).cause
        : undefined;
  }
  return false;
}

/** All of a user's event types, oldest first. Scoped to the user. */
export async function listEventTypesForUser(
  userId: string,
): Promise<EventTypeRow[]> {
  return db
    .select()
    .from(schema.eventTypes)
    .where(eq(schema.eventTypes.userId, userId))
    .orderBy(asc(schema.eventTypes.createdAt));
}

/**
 * A single event type by id, scoped to the owning user. Filtering on both
 * `userId` and `id` means a user cannot read another user's event type by
 * guessing its id. Returns null when no row matches.
 */
export async function getEventType(args: {
  userId: string;
  id: string;
}): Promise<EventTypeRow | null> {
  const row = await db.query.eventTypes.findFirst({
    where: and(
      eq(schema.eventTypes.userId, args.userId),
      eq(schema.eventTypes.id, args.id),
    ),
  });
  return row ?? null;
}

/**
 * A single event type by slug, scoped to the owning user. Filtering on both
 * `userId` and `slug` resolves the slug within one host's set (slugs are unique
 * per user via `event_types_user_slug_unique`). Does NOT filter on `enabled`:
 * the caller decides whether a disabled event type counts (the public resolver
 * gates on `enabled`; later flows may want the row regardless). Returns null
 * when no row matches.
 */
export async function getEventTypeBySlug(args: {
  userId: string;
  slug: string;
}): Promise<EventTypeRow | null> {
  const row = await db.query.eventTypes.findFirst({
    where: and(
      eq(schema.eventTypes.userId, args.userId),
      eq(schema.eventTypes.slug, args.slug),
    ),
  });
  return row ?? null;
}

/** Insert a new event type owned by `userId`. Throws SlugConflictError on a
 *  duplicate (userId, slug). */
export async function createEventType(
  userId: string,
  input: EventTypeInput,
): Promise<EventTypeRow> {
  try {
    const [row] = await db
      .insert(schema.eventTypes)
      .values({
        userId,
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
        durationMinutes: input.durationMinutes,
        bufferBeforeMinutes: input.bufferBeforeMinutes,
        bufferAfterMinutes: input.bufferAfterMinutes,
        minNoticeMinutes: input.minNoticeMinutes,
        maxFutureMinutes: input.maxFutureMinutes,
        slotGranularityMinutes: input.slotGranularityMinutes,
        color: input.color,
        enabled: input.enabled,
      })
      .returning();
    return row;
  } catch (err) {
    if (isUniqueViolation(err)) throw new SlugConflictError();
    throw err;
  }
}

/**
 * Update an event type scoped to (userId, id). Returns the updated row, or
 * null if no row matched (wrong id, or another user's id). Throws
 * SlugConflictError on a duplicate (userId, slug).
 */
export async function updateEventType(
  args: { userId: string; id: string },
  input: EventTypeInput,
): Promise<EventTypeRow | null> {
  try {
    const [row] = await db
      .update(schema.eventTypes)
      .set({
        name: input.name,
        slug: input.slug,
        description: input.description ?? null,
        durationMinutes: input.durationMinutes,
        bufferBeforeMinutes: input.bufferBeforeMinutes,
        bufferAfterMinutes: input.bufferAfterMinutes,
        minNoticeMinutes: input.minNoticeMinutes,
        maxFutureMinutes: input.maxFutureMinutes,
        slotGranularityMinutes: input.slotGranularityMinutes,
        color: input.color,
        enabled: input.enabled,
      })
      .where(
        and(
          eq(schema.eventTypes.userId, args.userId),
          eq(schema.eventTypes.id, args.id),
        ),
      )
      .returning();
    return row ?? null;
  } catch (err) {
    if (isUniqueViolation(err)) throw new SlugConflictError();
    throw err;
  }
}

/**
 * Delete an event type scoped to (userId, id). Returns true if a row was
 * removed, false otherwise (no such id, or another user's row). A user
 * cannot delete another user's event type.
 */
export async function deleteEventType(args: {
  userId: string;
  id: string;
}): Promise<boolean> {
  const deleted = await db
    .delete(schema.eventTypes)
    .where(
      and(
        eq(schema.eventTypes.userId, args.userId),
        eq(schema.eventTypes.id, args.id),
      ),
    )
    .returning({ id: schema.eventTypes.id });
  return deleted.length > 0;
}
