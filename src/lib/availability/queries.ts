import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { AvailabilityRuleRow } from "@/lib/db/schema/availability";
import type { HostSettingsRow } from "@/lib/db/schema/host-settings";
import type { AvailabilityRuleInput } from "./validation";

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
