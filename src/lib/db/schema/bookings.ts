import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { noclucalUsers } from "./users";
import { eventTypes } from "./event-types";
import { DEFAULT_BOOKING_STATUS } from "@/lib/bookings/constants";

/**
 * A confirmed booking is an immutable historical record. It snapshots the
 * event type name and duration at booking time and keeps only a nullable FK
 * to event_types (ON DELETE SET NULL), so deleting an event type never
 * destroys booking history and a row is self-describing.
 *
 * Double-booking is prevented at the database level by the
 * `bookings_no_overlap_per_host` EXCLUDE USING gist constraint: no two
 * `confirmed` bookings for the same host may have overlapping time ranges.
 * That constraint needs the btree_gist extension and is hand-added in
 * migration 0003; Drizzle cannot express EXCLUDE constraints, so it is NOT
 * declared here. See CALENDAR-PLAYBOOK.md § Booking model for the rationale.
 */
export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),

    eventTypeId: uuid("event_type_id").references(() => eventTypes.id, {
      onDelete: "set null",
    }),

    hostUserId: uuid("host_user_id")
      .notNull()
      .references(() => noclucalUsers.id, { onDelete: "cascade" }),

    eventTypeName: varchar("event_type_name", { length: 200 }).notNull(),
    durationMinutes: integer("duration_minutes").notNull(),

    inviteeName: varchar("invitee_name", { length: 200 }).notNull(),
    inviteeEmail: varchar("invitee_email", { length: 320 }).notNull(),
    inviteeNote: text("invitee_note"),
    inviteeTimezone: text("invitee_timezone").notNull(),

    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),

    status: varchar("status", { length: 20 })
      .notNull()
      .default(DEFAULT_BOOKING_STATUS),

    googleEventId: text("google_event_id"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    /** Common lookup pattern: "all bookings for a given host". */
    hostIdx: index("bookings_host_idx").on(table.hostUserId),

    /** Host bookings ordered or ranged by start instant. */
    hostStartsIdx: index("bookings_host_starts_idx").on(
      table.hostUserId,
      table.startsAt,
    ),

    /** Reverse lookup from an event type to its booking history. */
    eventTypeIdx: index("bookings_event_type_idx").on(table.eventTypeId),
  }),
);

export type BookingRow = typeof bookings.$inferSelect;
export type NewBookingRow = typeof bookings.$inferInsert;
