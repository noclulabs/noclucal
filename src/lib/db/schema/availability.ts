import {
  pgTable,
  uuid,
  smallint,
  time,
  date,
  boolean,
  timestamp,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { noclucalUsers } from "./users";

/**
 * Recurring weekly availability windows for a host. Keyed on user_id
 * directly: the MVP runs one schedule per host, shared by every event
 * type, so there is no FK to event_types and no schedule_id. Multi-schedule
 * is a future additive migration. Multiple rows per (user_id, weekday) are
 * intentional so split days (for example 09:00 to 12:00 and 13:00 to 17:00)
 * are first-class; there is deliberately no unique constraint on the pair.
 *
 * weekday is ISO 1 to 7 (Monday=1, Sunday=7) to match Luxon's
 * DateTime.weekday, removing conversion friction in Phase 3b. Times are
 * Postgres `time` (wall-clock, no timezone); they are interpreted in the
 * host's timezone, which resolves from host_settings. UTC conversion is a
 * Phase 3b slot-computation concern, never storage.
 */
export const availabilityRules = pgTable(
  "availability_rules",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),

    userId: uuid("user_id")
      .notNull()
      .references(() => noclucalUsers.id, { onDelete: "cascade" }),

    weekday: smallint("weekday").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    userIdx: index("availability_rules_user_idx").on(table.userId),
    userWeekdayIdx: index("availability_rules_user_weekday_idx").on(
      table.userId,
      table.weekday,
    ),
    weekdayRange: check(
      "availability_rules_weekday_range",
      sql`${table.weekday} between 1 and 7`,
    ),
    timeOrder: check(
      "availability_rules_time_order",
      sql`${table.startTime} < ${table.endTime}`,
    ),
  }),
);

/**
 * Date-specific exceptions to the recurring schedule: a blocked holiday
 * (is_available false, null times) or custom hours for one date
 * (is_available true, non-null times). Multiple rows per (user_id, date)
 * are allowed for split custom days, so there is no unique constraint on
 * the pair. The shape CHECK keeps the two modes mutually exclusive and
 * well-formed.
 */
export const availabilityOverrides = pgTable(
  "availability_overrides",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),

    userId: uuid("user_id")
      .notNull()
      .references(() => noclucalUsers.id, { onDelete: "cascade" }),

    date: date("date").notNull(),
    isAvailable: boolean("is_available").notNull(),
    startTime: time("start_time"),
    endTime: time("end_time"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    userIdx: index("availability_overrides_user_idx").on(table.userId),
    userDateIdx: index("availability_overrides_user_date_idx").on(
      table.userId,
      table.date,
    ),
    shape: check(
      "availability_overrides_shape",
      sql`(${table.isAvailable} = false AND ${table.startTime} IS NULL AND ${table.endTime} IS NULL) OR (${table.isAvailable} = true AND ${table.startTime} IS NOT NULL AND ${table.endTime} IS NOT NULL AND ${table.startTime} < ${table.endTime})`,
    ),
  }),
);

export type AvailabilityRuleRow = typeof availabilityRules.$inferSelect;
export type NewAvailabilityRuleRow = typeof availabilityRules.$inferInsert;
export type AvailabilityOverrideRow = typeof availabilityOverrides.$inferSelect;
export type NewAvailabilityOverrideRow =
  typeof availabilityOverrides.$inferInsert;
