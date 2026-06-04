"use server";

import "@/lib/calendar/providers/register-all";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getProvider } from "@/lib/calendar/providers";
import { decryptToken } from "@/lib/calendar/crypto";
import {
  deleteConnection,
  getConnectionForUser,
} from "@/lib/calendar/connections";

/**
 * Disconnect the current user's Google Calendar connection. Best-effort
 * revoke at the provider; the local connection row is deleted
 * unconditionally so the user sees the disconnect succeed in our UI
 * even if the provider revoke fails (token already revoked, network
 * error, etc.).
 */
export async function disconnectGoogleCalendar(): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Not authenticated");
  }

  const row = await getConnectionForUser({
    userId: session.user.id,
    provider: "google",
  });
  if (!row) {
    revalidatePath("/settings/calendars");
    return;
  }

  try {
    const refreshToken = decryptToken(row.refreshTokenCiphertext);
    const provider = getProvider("google");
    await provider.revoke({ refreshToken });
  } catch (err) {
    console.error("Google revoke failed; proceeding with local delete", err);
  }

  await deleteConnection(row.id);
  revalidatePath("/settings/calendars");
}
