import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type {
  CalendarConnectionRow,
  NewCalendarConnectionRow,
} from "@/lib/db/schema/calendar-connections";
import type { CalendarProviderId, CalendarTokens } from "./types";
import { decryptToken, encryptToken } from "./crypto";
import { getProvider } from "./providers";

const REFRESH_SAFETY_MARGIN_SECONDS = 60;

/**
 * Thrown by `getValidTokensForConnection` when token refresh fails at
 * the provider (e.g. the user revoked our access in their Google
 * account settings). The connection row has been deleted by the time
 * this is thrown; callers route the user to a "reconnect required" UX.
 */
export class RefreshFailedError extends Error {
  constructor(
    public connectionId: string,
    cause?: unknown,
  ) {
    super(`Refresh failed for connection ${connectionId}; connection deleted`);
    this.name = "RefreshFailedError";
    if (cause !== undefined) this.cause = cause;
  }
}

/**
 * Look up the (currently single) calendar connection for a (user,
 * provider) pair. Returns null if no connection exists.
 */
export async function getConnectionForUser(args: {
  userId: string;
  provider: CalendarProviderId;
}): Promise<CalendarConnectionRow | null> {
  const row = await db.query.calendarConnections.findFirst({
    where: and(
      eq(schema.calendarConnections.userId, args.userId),
      eq(schema.calendarConnections.provider, args.provider),
    ),
  });
  return row ?? null;
}

/**
 * Replace any existing calendar connection for (user, provider) with
 * a new row carrying the supplied details. DELETE-then-INSERT inside
 * a single transaction so the unique-per-(user, provider) constraint
 * cannot conflict and so a failure rolls back cleanly.
 *
 * The caller passes already-encrypted ciphertexts; this helper does
 * not encrypt. (Encryption happens in the OAuth callback where the
 * plaintext tokens are still in scope.)
 */
export async function replaceConnection(args: {
  userId: string;
  provider: CalendarProviderId;
  externalAccountId: string;
  externalAccountEmail: string;
  accessTokenCiphertext: string;
  refreshTokenCiphertext: string;
  tokenExpiresAt: Date;
  scopes: string[];
}): Promise<CalendarConnectionRow> {
  return await db.transaction(async (tx) => {
    await tx
      .delete(schema.calendarConnections)
      .where(
        and(
          eq(schema.calendarConnections.userId, args.userId),
          eq(schema.calendarConnections.provider, args.provider),
        ),
      );
    const inserted = await tx
      .insert(schema.calendarConnections)
      .values({
        userId: args.userId,
        provider: args.provider,
        externalAccountId: args.externalAccountId,
        externalAccountEmail: args.externalAccountEmail,
        accessTokenCiphertext: args.accessTokenCiphertext,
        refreshTokenCiphertext: args.refreshTokenCiphertext,
        tokenExpiresAt: args.tokenExpiresAt,
        scopes: args.scopes,
      } satisfies NewCalendarConnectionRow)
      .returning();
    if (inserted.length === 0) {
      throw new Error("Insert returned no rows");
    }
    return inserted[0];
  });
}

/**
 * Delete a connection by id. Returns true if a row was deleted, false
 * if no row existed for that id. Idempotent.
 */
export async function deleteConnection(connectionId: string): Promise<boolean> {
  const deleted = await db
    .delete(schema.calendarConnections)
    .where(eq(schema.calendarConnections.id, connectionId))
    .returning({ id: schema.calendarConnections.id });
  return deleted.length > 0;
}

/**
 * Return decrypted, freshly-refreshed tokens for a connection. If the
 * stored access token is expired (or within 60s of expiry), refresh
 * via the provider and persist the new token set.
 *
 * On refresh failure (provider rejects the refresh token), the
 * connection row is deleted and a `RefreshFailedError` is thrown.
 * Callers should catch this and surface a reconnect-required UX.
 */
export async function getValidTokensForConnection(
  connectionId: string,
): Promise<CalendarTokens> {
  const row = await db.query.calendarConnections.findFirst({
    where: eq(schema.calendarConnections.id, connectionId),
  });
  if (!row) {
    throw new Error(`Calendar connection ${connectionId} not found`);
  }

  const tokens: CalendarTokens = {
    accessToken: decryptToken(row.accessTokenCiphertext),
    refreshToken: decryptToken(row.refreshTokenCiphertext),
    expiresAt: row.tokenExpiresAt,
  };

  const expiresInMs = tokens.expiresAt.getTime() - Date.now();
  if (expiresInMs > REFRESH_SAFETY_MARGIN_SECONDS * 1000) {
    return tokens;
  }

  const provider = getProvider(row.provider as CalendarProviderId);
  let refreshed: CalendarTokens;
  try {
    refreshed = await provider.refreshAccessToken({
      refreshToken: tokens.refreshToken,
    });
  } catch (err) {
    await deleteConnection(row.id);
    throw new RefreshFailedError(row.id, err);
  }

  await db
    .update(schema.calendarConnections)
    .set({
      accessTokenCiphertext: encryptToken(refreshed.accessToken),
      refreshTokenCiphertext: encryptToken(refreshed.refreshToken),
      tokenExpiresAt: refreshed.expiresAt,
      lastSyncedAt: new Date(),
    })
    .where(eq(schema.calendarConnections.id, row.id));

  return refreshed;
}
