import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import type { CalendarTokens } from "@/lib/calendar/types";

// Mock the provider registry so the refresh path can be exercised without
// live Google calls. Declared at module top so the factory below can close
// over it; the consuming module (connections.ts) is imported after vi.mock,
// matching the pattern in google.test.ts.
const mockRefreshAccessToken = vi.fn();

vi.mock("@/lib/calendar/providers", () => ({
  getProvider: () => ({ refreshAccessToken: mockRefreshAccessToken }),
}));

// Imported AFTER vi.mock so the mock is in place when connections.ts resolves
// its `./providers` import.
import { closeDb, db } from "@/lib/db";
import { calendarConnections, noclucalUsers } from "@/lib/db/schema";
import { encryptToken } from "@/lib/calendar/crypto";
import {
  RefreshFailedError,
  deleteConnection,
  getConnectionForUser,
  getValidTokensForConnection,
  replaceConnection,
} from "@/lib/calendar/connections";

// Fresh 32-byte test key per file run, decoupled from .env.local so outcomes
// never depend on the deployed key. Real crypto exercises the end-to-end
// encrypt -> store -> decrypt path.
const TEST_KEY = randomBytes(32).toString("base64");

const USER_A = "01940000-0000-7000-8000-0000000000a1";
const USER_B = "01940000-0000-7000-8000-0000000000b2";
const MISSING_ID = "01940000-0000-7000-8000-0000dead0000";

async function seedUser(id: string, username: string): Promise<void> {
  await db.insert(noclucalUsers).values({ id, username });
}

async function seedConnection(args: {
  userId: string;
  provider?: string;
  externalAccountId?: string;
  externalAccountEmail?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes?: string[];
}): Promise<typeof calendarConnections.$inferSelect> {
  const [row] = await db
    .insert(calendarConnections)
    .values({
      userId: args.userId,
      provider: args.provider ?? "google",
      externalAccountId: args.externalAccountId ?? "ext-account-1",
      externalAccountEmail: args.externalAccountEmail ?? "user@example.com",
      accessTokenCiphertext: encryptToken(args.accessToken ?? "access-1"),
      refreshTokenCiphertext: encryptToken(args.refreshToken ?? "refresh-1"),
      tokenExpiresAt: args.expiresAt ?? new Date(Date.now() + 3_600_000),
      scopes: args.scopes ?? ["openid", "email"],
    })
    .returning();
  return row;
}

describe("calendar connections helper", () => {
  let savedKey: string | undefined;

  beforeEach(async () => {
    savedKey = process.env.TOKEN_ENCRYPTION_KEY;
    process.env.TOKEN_ENCRYPTION_KEY = TEST_KEY;
    vi.clearAllMocks();
    // Child table first to respect the FK, though the cascade would cover it.
    await db.delete(calendarConnections);
    await db.delete(noclucalUsers);
  });

  afterEach(() => {
    if (savedKey === undefined) {
      delete process.env.TOKEN_ENCRYPTION_KEY;
    } else {
      process.env.TOKEN_ENCRYPTION_KEY = savedKey;
    }
  });

  afterAll(async () => {
    await closeDb();
  });

  describe("getConnectionForUser", () => {
    it("returns null when no connection exists", async () => {
      await seedUser(USER_A, "alice");
      const row = await getConnectionForUser({
        userId: USER_A,
        provider: "google",
      });
      expect(row).toBeNull();
    });

    it("returns the row when a connection exists", async () => {
      await seedUser(USER_A, "alice");
      const seeded = await seedConnection({
        userId: USER_A,
        externalAccountEmail: "alice@example.com",
      });
      const row = await getConnectionForUser({
        userId: USER_A,
        provider: "google",
      });
      expect(row?.id).toBe(seeded.id);
      expect(row?.externalAccountEmail).toBe("alice@example.com");
    });

    it("does not return another user's connection", async () => {
      await seedUser(USER_A, "alice");
      await seedUser(USER_B, "bob");
      await seedConnection({ userId: USER_A });
      const row = await getConnectionForUser({
        userId: USER_B,
        provider: "google",
      });
      expect(row).toBeNull();
    });
  });

  describe("replaceConnection", () => {
    it("inserts a new row when none exists", async () => {
      await seedUser(USER_A, "alice");
      const inserted = await replaceConnection({
        userId: USER_A,
        provider: "google",
        externalAccountId: "ext-1",
        externalAccountEmail: "alice@example.com",
        accessTokenCiphertext: "ct-access",
        refreshTokenCiphertext: "ct-refresh",
        tokenExpiresAt: new Date(Date.now() + 3_600_000),
        scopes: ["openid", "email"],
      });
      expect(inserted.externalAccountEmail).toBe("alice@example.com");

      const row = await getConnectionForUser({
        userId: USER_A,
        provider: "google",
      });
      expect(row?.id).toBe(inserted.id);
      expect(row?.scopes).toEqual(["openid", "email"]);
    });

    it("replaces an existing row for the same (user, provider)", async () => {
      await seedUser(USER_A, "alice");
      await seedConnection({
        userId: USER_A,
        externalAccountId: "old-ext",
        externalAccountEmail: "old@example.com",
      });
      await replaceConnection({
        userId: USER_A,
        provider: "google",
        externalAccountId: "new-ext",
        externalAccountEmail: "new@example.com",
        accessTokenCiphertext: "ct-access",
        refreshTokenCiphertext: "ct-refresh",
        tokenExpiresAt: new Date(Date.now() + 3_600_000),
        scopes: ["openid"],
      });

      const rows = await db
        .select()
        .from(calendarConnections)
        .where(eq(calendarConnections.userId, USER_A));
      expect(rows).toHaveLength(1);
      expect(rows[0].externalAccountEmail).toBe("new@example.com");
      expect(rows[0].externalAccountId).toBe("new-ext");
    });

    it("does not affect connections for other users", async () => {
      await seedUser(USER_A, "alice");
      await seedUser(USER_B, "bob");
      const other = await seedConnection({
        userId: USER_B,
        externalAccountEmail: "bob@example.com",
      });
      await replaceConnection({
        userId: USER_A,
        provider: "google",
        externalAccountId: "new-ext",
        externalAccountEmail: "alice@example.com",
        accessTokenCiphertext: "ct-access",
        refreshTokenCiphertext: "ct-refresh",
        tokenExpiresAt: new Date(Date.now() + 3_600_000),
        scopes: ["openid"],
      });

      const stillThere = await getConnectionForUser({
        userId: USER_B,
        provider: "google",
      });
      expect(stillThere?.id).toBe(other.id);
      expect(stillThere?.externalAccountEmail).toBe("bob@example.com");
    });

    it("does not affect connections for other providers", async () => {
      await seedUser(USER_A, "alice");
      // A non-google provider row inserted directly; the union only has
      // "google" today, so this guards future cross-provider deletes.
      const microsoft = await seedConnection({
        userId: USER_A,
        provider: "microsoft",
        externalAccountId: "ms-ext",
        externalAccountEmail: "alice@outlook.com",
      });
      await replaceConnection({
        userId: USER_A,
        provider: "google",
        externalAccountId: "g-ext",
        externalAccountEmail: "alice@gmail.com",
        accessTokenCiphertext: "ct-access",
        refreshTokenCiphertext: "ct-refresh",
        tokenExpiresAt: new Date(Date.now() + 3_600_000),
        scopes: ["openid"],
      });

      const rows = await db
        .select()
        .from(calendarConnections)
        .where(eq(calendarConnections.userId, USER_A));
      expect(rows).toHaveLength(2);
      const msRow = rows.find((r) => r.id === microsoft.id);
      expect(msRow?.provider).toBe("microsoft");
      expect(msRow?.externalAccountEmail).toBe("alice@outlook.com");
    });

    it("rolls back the delete when the insert fails (transactional)", async () => {
      await seedUser(USER_A, "alice");
      await seedConnection({
        userId: USER_A,
        externalAccountId: "original-ext",
        externalAccountEmail: "original@example.com",
      });

      // An Invalid Date throws during driver-value serialization of the
      // INSERT, after the DELETE has run inside the same transaction. If the
      // write were not transactional, the original row would be gone.
      await expect(
        replaceConnection({
          userId: USER_A,
          provider: "google",
          externalAccountId: "new-ext",
          externalAccountEmail: "new@example.com",
          accessTokenCiphertext: "ct-access",
          refreshTokenCiphertext: "ct-refresh",
          tokenExpiresAt: new Date("not-a-real-date"),
          scopes: ["openid"],
        }),
      ).rejects.toThrow();

      const row = await getConnectionForUser({
        userId: USER_A,
        provider: "google",
      });
      expect(row?.externalAccountId).toBe("original-ext");
      expect(row?.externalAccountEmail).toBe("original@example.com");
    });
  });

  describe("deleteConnection", () => {
    it("returns true when a row was deleted", async () => {
      await seedUser(USER_A, "alice");
      const seeded = await seedConnection({ userId: USER_A });
      expect(await deleteConnection(seeded.id)).toBe(true);
      const row = await getConnectionForUser({
        userId: USER_A,
        provider: "google",
      });
      expect(row).toBeNull();
    });

    it("returns false when no row existed for the id", async () => {
      expect(await deleteConnection(MISSING_ID)).toBe(false);
    });
  });

  describe("getValidTokensForConnection", () => {
    it("throws when the connection id does not exist", async () => {
      await expect(getValidTokensForConnection(MISSING_ID)).rejects.toThrow(
        /not found/,
      );
    });

    it("returns stored tokens when far from expiry (no refresh)", async () => {
      await seedUser(USER_A, "alice");
      const seeded = await seedConnection({
        userId: USER_A,
        accessToken: "access-far",
        refreshToken: "refresh-far",
        expiresAt: new Date(Date.now() + 3_600_000),
      });

      const tokens = await getValidTokensForConnection(seeded.id);
      expect(tokens.accessToken).toBe("access-far");
      expect(tokens.refreshToken).toBe("refresh-far");
      expect(mockRefreshAccessToken).not.toHaveBeenCalled();
    });

    it("refreshes when the access token is within 60s of expiry", async () => {
      await seedUser(USER_A, "alice");
      const seeded = await seedConnection({
        userId: USER_A,
        refreshToken: "refresh-orig",
        expiresAt: new Date(Date.now() + 30_000),
      });
      const refreshed: CalendarTokens = {
        accessToken: "access-new",
        refreshToken: "refresh-new",
        expiresAt: new Date(Date.now() + 3_600_000),
      };
      mockRefreshAccessToken.mockResolvedValue(refreshed);

      const tokens = await getValidTokensForConnection(seeded.id);
      expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1);
      expect(mockRefreshAccessToken).toHaveBeenCalledWith({
        refreshToken: "refresh-orig",
      });
      expect(tokens.accessToken).toBe("access-new");
    });

    it("refreshes when the access token is already expired", async () => {
      await seedUser(USER_A, "alice");
      const seeded = await seedConnection({
        userId: USER_A,
        refreshToken: "refresh-orig",
        expiresAt: new Date(Date.now() - 10_000),
      });
      mockRefreshAccessToken.mockResolvedValue({
        accessToken: "access-new",
        refreshToken: "refresh-new",
        expiresAt: new Date(Date.now() + 3_600_000),
      } satisfies CalendarTokens);

      await getValidTokensForConnection(seeded.id);
      expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1);
    });

    it("persists new tokens after a successful refresh", async () => {
      await seedUser(USER_A, "alice");
      const seeded = await seedConnection({
        userId: USER_A,
        refreshToken: "refresh-orig",
        expiresAt: new Date(Date.now() - 10_000),
      });
      mockRefreshAccessToken.mockResolvedValue({
        accessToken: "access-new",
        refreshToken: "refresh-new",
        expiresAt: new Date(Date.now() + 3_600_000),
      } satisfies CalendarTokens);

      await getValidTokensForConnection(seeded.id);
      mockRefreshAccessToken.mockClear();

      // The persisted expiry is now far in the future, so the second call
      // short-circuits and returns the stored (new) tokens without refresh.
      const tokens = await getValidTokensForConnection(seeded.id);
      expect(mockRefreshAccessToken).not.toHaveBeenCalled();
      expect(tokens.accessToken).toBe("access-new");
      expect(tokens.refreshToken).toBe("refresh-new");
    });

    it("preserves the caller's refresh token when Google does not rotate", async () => {
      await seedUser(USER_A, "alice");
      const seeded = await seedConnection({
        userId: USER_A,
        refreshToken: "refresh-orig",
        expiresAt: new Date(Date.now() - 10_000),
      });
      // Provider returns the same refresh token it was given (no rotation).
      mockRefreshAccessToken.mockImplementation(
        async ({ refreshToken }: { refreshToken: string }) => ({
          accessToken: "access-new",
          refreshToken,
          expiresAt: new Date(Date.now() + 3_600_000),
        }),
      );

      await getValidTokensForConnection(seeded.id);
      mockRefreshAccessToken.mockClear();

      const tokens = await getValidTokensForConnection(seeded.id);
      expect(tokens.refreshToken).toBe("refresh-orig");
    });

    it("uses the new refresh token when Google rotates", async () => {
      await seedUser(USER_A, "alice");
      const seeded = await seedConnection({
        userId: USER_A,
        refreshToken: "refresh-orig",
        expiresAt: new Date(Date.now() - 10_000),
      });
      mockRefreshAccessToken.mockResolvedValue({
        accessToken: "access-new",
        refreshToken: "refresh-rotated",
        expiresAt: new Date(Date.now() + 3_600_000),
      } satisfies CalendarTokens);

      await getValidTokensForConnection(seeded.id);
      mockRefreshAccessToken.mockClear();

      const tokens = await getValidTokensForConnection(seeded.id);
      expect(tokens.refreshToken).toBe("refresh-rotated");
    });

    it("throws RefreshFailedError when the provider refresh throws", async () => {
      await seedUser(USER_A, "alice");
      const seeded = await seedConnection({
        userId: USER_A,
        expiresAt: new Date(Date.now() - 10_000),
      });
      mockRefreshAccessToken.mockRejectedValue(new Error("token revoked"));

      await expect(getValidTokensForConnection(seeded.id)).rejects.toBeInstanceOf(
        RefreshFailedError,
      );
    });

    it("deletes the connection row when the provider refresh fails", async () => {
      await seedUser(USER_A, "alice");
      const seeded = await seedConnection({
        userId: USER_A,
        expiresAt: new Date(Date.now() - 10_000),
      });
      mockRefreshAccessToken.mockRejectedValue(new Error("token revoked"));

      await expect(
        getValidTokensForConnection(seeded.id),
      ).rejects.toBeInstanceOf(RefreshFailedError);

      const row = await getConnectionForUser({
        userId: USER_A,
        provider: "google",
      });
      expect(row).toBeNull();
    });
  });
});
