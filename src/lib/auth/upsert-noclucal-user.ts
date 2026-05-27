import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { noclucalUsers } from "@/lib/db/schema";

// Lazy projection of an authenticated user into the noclucal_users shadow
// table. Idempotent: inserts on first observation, updates username and
// display_name (and bumps observed_at) on subsequent observations.
//
// Callers should treat this as best-effort. A failure here MUST NOT break
// the requesting page render; log and continue. The shadow table is a
// performance optimization (avoids round-trips to noclulabs for cached
// fields), not a correctness requirement.
export async function upsertNoclucalUser(user: {
  id: string;
  username: string;
  displayName?: string | null;
}): Promise<void> {
  await db
    .insert(noclucalUsers)
    .values({
      id: user.id,
      username: user.username,
      displayName: user.displayName ?? null,
    })
    .onConflictDoUpdate({
      target: noclucalUsers.id,
      set: {
        username: sql`excluded.username`,
        displayName: sql`excluded.display_name`,
        observedAt: sql`now()`,
      },
    });
}
