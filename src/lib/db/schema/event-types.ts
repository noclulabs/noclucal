import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { noclucalUsers } from "./users";
import { DEFAULT_EVENT_TYPE_COLOR } from "@/lib/event-types/colors";

/**
 * A bookable event type owned by a host. Durations and windows are stored
 * as integer minutes throughout (no Postgres interval columns), so slot
 * computation in Phase 3b works in a single unit. `slug` is unique per
 * user via the index below; lowercasing, kebab-case enforcement, and the
 * reserved-words check are app-layer concerns for Phase 3c. `color` stores
 * a named palette token validated against EVENT_TYPE_COLORS at the app
 * layer (Phase 3c), not the DB, so the palette evolves without a migration.
 */
export const eventTypes = pgTable(
  "event_types",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),

    userId: uuid("user_id")
      .notNull()
      .references(() => noclucalUsers.id, { onDelete: "cascade" }),

    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 200 }).notNull(),
    description: text("description"),

    durationMinutes: integer("duration_minutes").notNull(),
    bufferBeforeMinutes: integer("buffer_before_minutes").notNull().default(0),
    bufferAfterMinutes: integer("buffer_after_minutes").notNull().default(0),
    minNoticeMinutes: integer("min_notice_minutes").notNull().default(0),
    maxFutureMinutes: integer("max_future_minutes").notNull().default(86400),
    slotGranularityMinutes: integer("slot_granularity_minutes")
      .notNull()
      .default(15),

    color: varchar("color", { length: 32 })
      .notNull()
      .default(DEFAULT_EVENT_TYPE_COLOR),
    enabled: boolean("enabled").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    /** Slug must be unique within a host's set of event types. */
    userSlugUniq: uniqueIndex("event_types_user_slug_unique").on(
      table.userId,
      table.slug,
    ),

    /** Common lookup pattern: "all event types for a given user". */
    userIdx: index("event_types_user_idx").on(table.userId),
  }),
);

export type EventTypeRow = typeof eventTypes.$inferSelect;
export type NewEventTypeRow = typeof eventTypes.$inferInsert;
