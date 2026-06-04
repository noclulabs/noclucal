import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type {
  AvailabilityOverrideRow,
  AvailabilityRuleRow,
} from "@/lib/db/schema/availability";
import type { HostSettingsRow } from "@/lib/db/schema/host-settings";
import type { AvailabilityRuleInput, DateOverrideInput } from "./validation";

/**
 * All of a user's recurring weekly availability rules, ordered by weekday
 * (ISO 1 to 7) then start time. Scoped to the user. The `time` column
 * returns "HH:MM:SS"; callers that feed the editor truncate to "HH:MM".
 */
export async function listAvailabilityRulesForUser(
  userId: string,
): Promise<AvailabilityRuleRow[]> {
  return db
    .select()
    .from(schema.availabilityRules)
    .where(eq(schema.availabilityRules.userId, userId))
    .orderBy(
      asc(schema.availabilityRules.weekday),
      asc(schema.availabilityRules.startTime),
    );
}

/**
 * Replace a user's entire weekly schedule in one transaction: delete every
 * existing rule for the user, then insert the submitted set. Mirrors the
 * Phase 2 `replaceConnection` pattern and avoids per-row diffing. An empty
 * `rules` array is valid and simply clears the schedule (no insert runs).
 */
export async function replaceAvailabilityRulesForUser(
  userId: string,
  rules: AvailabilityRuleInput[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(schema.availabilityRules)
      .where(eq(schema.availabilityRules.userId, userId));
    if (rules.length > 0) {
      await tx.insert(schema.availabilityRules).values(
        rules.map((r) => ({
          userId,
          weekday: r.weekday,
          startTime: r.startTime,
          endTime: r.endTime,
        })),
      );
    }
  });
}

/** The user's host settings row, or null when none exists yet. */
export async function getHostSettings(
  userId: string,
): Promise<HostSettingsRow | null> {
  const row = await db.query.hostSettings.findFirst({
    where: eq(schema.hostSettings.userId, userId),
  });
  return row ?? null;
}

/**
 * Set the user's booking timezone. Inserts the host_settings row on first
 * save and updates it thereafter, keyed 1:1 on user_id. The caller is
 * expected to have validated the IANA zone with `timezoneSchema`.
 */
export async function upsertHostTimezone(
  userId: string,
  timezone: string,
): Promise<void> {
  await db
    .insert(schema.hostSettings)
    .values({ userId, timezone })
    .onConflictDoUpdate({
      target: schema.hostSettings.userId,
      set: { timezone, updatedAt: new Date() },
    });
}

/**
 * All of a user's date-specific overrides, ordered by date ascending then
 * start time ascending. Scoped to the user. Rows are flat: a blocked day is
 * a single `is_available` false row with null times; a custom-hours day is
 * one row per range. The page groups them by date for display. The `time`
 * column returns "HH:MM:SS"; callers that feed the editor truncate to "HH:MM".
 */
export async function listAvailabilityOverridesForUser(
  userId: string,
): Promise<AvailabilityOverrideRow[]> {
  return db
    .select()
    .from(schema.availabilityOverrides)
    .where(eq(schema.availabilityOverrides.userId, userId))
    .orderBy(
      asc(schema.availabilityOverrides.date),
      asc(schema.availabilityOverrides.startTime),
    );
}

/**
 * Replace a single date's override in one transaction: delete the user's
 * existing rows for that date, then insert the new row or rows. Mirrors the
 * weekly replace, scoped to one date. A blocked date inserts one row with
 * null times; a custom-hours date inserts one row per range. The schema's
 * block-versus-custom refine guarantees the rows satisfy the DB shape CHECK.
 */
export async function setDateOverrideForUser(
  userId: string,
  input: DateOverrideInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(schema.availabilityOverrides)
      .where(
        and(
          eq(schema.availabilityOverrides.userId, userId),
          eq(schema.availabilityOverrides.date, input.date),
        ),
      );

    if (input.blocked) {
      await tx.insert(schema.availabilityOverrides).values({
        userId,
        date: input.date,
        isAvailable: false,
        startTime: null,
        endTime: null,
      });
    } else {
      await tx.insert(schema.availabilityOverrides).values(
        input.ranges.map((r) => ({
          userId,
          date: input.date,
          isAvailable: true,
          startTime: r.startTime,
          endTime: r.endTime,
        })),
      );
    }
  });
}

/**
 * Delete every override row for a user on a given date. Returns true if any
 * row was removed, false otherwise. Scoped to the user, so one user can never
 * clear another user's override.
 */
export async function deleteDateOverrideForUser(
  userId: string,
  date: string,
): Promise<boolean> {
  const deleted = await db
    .delete(schema.availabilityOverrides)
    .where(
      and(
        eq(schema.availabilityOverrides.userId, userId),
        eq(schema.availabilityOverrides.date, date),
      ),
    )
    .returning({ id: schema.availabilityOverrides.id });
  return deleted.length > 0;
}
