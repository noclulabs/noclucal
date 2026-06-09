import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getEventTypeBySlug } from "@/lib/event-types/queries";
import type { EventTypeRow } from "@/lib/db/schema/event-types";
import type { NoclucalUser } from "@/lib/db/schema/users";

/**
 * What a public booking URL (`/[username]/[slug]`) resolves to: the host whose
 * `username` matched, plus the enabled event type the `slug` named. `host` is
 * carried so the page can render a display name without a second query.
 */
export interface ResolvedPublicEventType {
  hostUserId: string;
  host: NoclucalUser;
  eventType: EventTypeRow;
}

/**
 * Resolve a public booking URL to a bookable event type, or null when the URL
 * names no bookable page. Three null cases collapse to one return so the caller
 * (the public page) renders a single 404: unknown username, unknown slug, or a
 * disabled event type.
 *
 * Read-only. The slug-by-user lookup is enabled-agnostic (see
 * `getEventTypeBySlug`); the `enabled` gate lives here so this resolver decides
 * what is publicly bookable.
 */
export async function resolvePublicEventType(args: {
  username: string;
  slug: string;
}): Promise<ResolvedPublicEventType | null> {
  // `username` is citext, so this match is case-insensitive at the database
  // level, and it is unique (`noclucal_users_username_unique`, migration 0005),
  // so this resolves to at most one host.
  const host = await db.query.noclucalUsers.findFirst({
    where: eq(schema.noclucalUsers.username, args.username),
  });
  if (!host) return null;

  const eventType = await getEventTypeBySlug({
    userId: host.id,
    slug: args.slug,
  });
  if (!eventType || !eventType.enabled) return null;

  return { hostUserId: host.id, host, eventType };
}
