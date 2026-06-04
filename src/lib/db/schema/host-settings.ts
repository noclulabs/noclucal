import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { noclucalUsers } from "./users";

/**
 * noCluCal-owned per-user scheduling config. Exists so noclucal_users
 * stays a pure projection of noclulabs identity: host-owned config like
 * the booking timezone never lives on the shadow table. `timezone` is an
 * IANA string; Phase 3a only sets a pragmatic column default, and Phase
 * 3c surfaces a picker and validates against Luxon's IANAZone.isValidZone.
 */
export const hostSettings = pgTable("host_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => noclucalUsers.id, { onDelete: "cascade" }),

  timezone: text("timezone").notNull().default("America/Los_Angeles"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type HostSettingsRow = typeof hostSettings.$inferSelect;
export type NewHostSettingsRow = typeof hostSettings.$inferInsert;
