import {
  pgTable,
  uuid,
  text,
  timestamp,
  varchar,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { noclucalUsers } from "./users";

/**
 * A connected external calendar account. One row per (user, provider)
 * in the MVP; this is enforced by the unique index below. Disconnect
 * is a hard DELETE of the row; we do not soft-delete or keep history
 * here.
 *
 * Access and refresh tokens are stored as ciphertext strings in the
 * `v1:base64nonce:base64ciphertext` format. Encryption and decryption
 * helpers ship in Phase 2b; for Phase 2a these columns are plain text
 * with no crypto.
 */
export const calendarConnections = pgTable(
  "calendar_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    userId: uuid("user_id")
      .notNull()
      .references(() => noclucalUsers.id, { onDelete: "cascade" }),

    /** Matches the `CalendarProviderId` union in src/lib/calendar/types.ts. */
    provider: varchar("provider", { length: 32 }).notNull(),

    /** Stable opaque identifier of the connected account at the provider. */
    externalAccountId: text("external_account_id").notNull(),

    /** Email address of the connected account, for display. */
    externalAccountEmail: text("external_account_email").notNull(),

    /** v1:base64nonce:base64ciphertext (see Phase 2b helpers). */
    accessTokenCiphertext: text("access_token_ciphertext").notNull(),

    /** v1:base64nonce:base64ciphertext (see Phase 2b helpers). */
    refreshTokenCiphertext: text("refresh_token_ciphertext").notNull(),

    tokenExpiresAt: timestamp("token_expires_at", {
      withTimezone: true,
    }).notNull(),

    /** Scopes actually granted by the provider at connect time. */
    scopes: text("scopes").array().notNull(),

    connectedAt: timestamp("connected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    /** Last successful provider call, used by 2b/2c for diagnostics. */
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  },
  (table) => ({
    /**
     * Enforces "one Google account per user" semantics for the MVP.
     * To later allow multiple accounts per provider per user, drop
     * this index and rely on the `userProviderAccountUniq` below.
     */
    userProviderUniq: uniqueIndex("calendar_connections_user_provider_uniq").on(
      table.userId,
      table.provider,
    ),

    /**
     * Defense in depth: even if `userProviderUniq` is dropped later,
     * we never want two rows for the exact same external account.
     */
    userProviderAccountUniq: uniqueIndex(
      "calendar_connections_user_provider_account_uniq",
    ).on(table.userId, table.provider, table.externalAccountId),

    /** Common lookup pattern: "all connections for a given user". */
    userIdx: index("calendar_connections_user_idx").on(table.userId),
  }),
);

export type CalendarConnectionRow = typeof calendarConnections.$inferSelect;
export type NewCalendarConnectionRow = typeof calendarConnections.$inferInsert;
