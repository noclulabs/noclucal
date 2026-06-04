import Link from "next/link";
import { auth } from "@/auth";
import { listEventTypesForUser } from "@/lib/event-types/queries";
import {
  EVENT_TYPE_COLOR_HEX,
  type EventTypeColor,
} from "@/lib/event-types/colors";
import { deleteEventTypeAction } from "./actions";

// Depends on the session cookie, so it must never be statically prerendered.
export const dynamic = "force-dynamic";

export default async function EventTypesPage() {
  const session = await auth();
  // proxy.ts protects this route; session is non-null here, but TS does
  // not know that without a runtime check.
  if (!session?.user?.id) {
    return null;
  }

  const eventTypes = await listEventTypesForUser(session.user.id);

  return (
    <>
      <div className="flex items-end justify-between gap-4 mb-8">
        <h1 className="text-3xl md:text-4xl font-medium text-foreground">
          Event types
        </h1>
        <Link
          href="/settings/event-types/new"
          className="inline-flex items-center rounded-full border-[1.5px] border-primary px-5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-canvas"
        >
          Create event type
        </Link>
      </div>

      {eventTypes.length === 0 ? (
        <section className="bg-surface rounded-[20px] p-6">
          <p className="text-sm text-foreground-muted">
            No event types yet. Create your first one to start taking bookings.
          </p>
        </section>
      ) : (
        <ul className="space-y-3">
          {eventTypes.map((et) => (
            <li
              key={et.id}
              className="bg-surface rounded-[20px] p-5 flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-4 min-w-0">
                <span
                  aria-hidden
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{
                    backgroundColor:
                      EVENT_TYPE_COLOR_HEX[et.color as EventTypeColor] ??
                      "var(--color-foreground-muted)",
                  }}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {et.name}
                  </p>
                  <p className="text-xs text-foreground-muted truncate">
                    /{et.slug} &middot; {et.durationMinutes} min &middot;{" "}
                    {et.enabled ? "Enabled" : "Disabled"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Link
                  href={`/settings/event-types/${et.id}`}
                  className="inline-flex items-center rounded-full border-[1.5px] border-border px-4 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-foreground-muted"
                >
                  Edit
                </Link>
                <form action={deleteEventTypeAction}>
                  <input type="hidden" name="id" value={et.id} />
                  <button
                    type="submit"
                    className="inline-flex items-center rounded-full border-[1.5px] border-border px-4 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:border-foreground-muted hover:text-foreground"
                  >
                    Delete
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
