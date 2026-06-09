import { pgTable, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { customCitext } from "./_types";

// noclucal_users is a lightweight projection (shadow table) of the
// authoritative users table that lives in the noclulabs.com database.
// noCluCal NEVER writes to the noclulabs users table. References to users
// are by external id only; this table caches `username` and `display_name`
// so noCluCal queries do not need to call back to noclulabs.
//
// The row is inserted lazily on first observation of each user (any
// authenticated request where the user_id is not yet in noclucal_users).
// The id matches noclulabs users.id exactly; no default here because
// noCluCal does not generate user ids.
//
// When `username` or `display_name` change on the noclulabs side, the next
// lazy observation in noCluCal will need to refresh them. The exact refresh
// strategy ships in Phase 1d as part of the SSO bridge wiring.
export const noclucalUsers = pgTable(
  "noclucal_users",
  {
    id: uuid("id").primaryKey(),
    username: customCitext("username").notNull(),
    displayName: text("display_name"),
    observedAt: timestamp("observed_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    // `username` is unique now that public booking URLs (`/[username]/[slug]`)
    // resolve a host by it. citext, so uniqueness is case-insensitive. The
    // column is NOT NULL, so Postgres treating nulls as distinct does not apply.
    usernameUniq: uniqueIndex("noclucal_users_username_unique").on(
      table.username,
    ),
  }),
);

export type NoclucalUser = typeof noclucalUsers.$inferSelect;
export type NewNoclucalUser = typeof noclucalUsers.$inferInsert;
