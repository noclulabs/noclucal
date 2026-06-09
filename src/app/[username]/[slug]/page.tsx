import { notFound } from "next/navigation";

import {
  CalendarUnavailableError,
  NotBookableError,
  getAvailableSlots,
} from "@/lib/booking/available-slots";
import { resolvePublicEventType } from "@/lib/booking/resolve";
import { BookingPicker } from "./booking-picker";

// Reads live freebusy on every request, so it must never be cached or
// statically prerendered. Static routes (`/me`, `/settings`) take precedence
// over this root-level dynamic segment; this route is public and outside the
// `proxy.ts` auth matcher.
export const dynamic = "force-dynamic";

const MS_PER_MINUTE = 60_000;
// Cap the fetch window even when an event type allows booking further out, so a
// single page render never asks the engine (and Google freebusy) for an
// unbounded horizon. The engine clamps further by `now + minNoticeMinutes`.
const MAX_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins === 0 ? `${hours} hr` : `${hours} hr ${mins} min`;
}

/** A calm, on-brand state panel for the non-picker outcomes. */
function StatePanel({ title, message }: { title: string; message: string }) {
  return (
    <section className="bg-surface rounded-[20px] p-8 text-center">
      <p className="text-base font-medium text-foreground">{title}</p>
      <p className="mt-2 text-sm text-foreground-muted">{message}</p>
    </section>
  );
}

export default async function PublicBookingPage({
  params,
}: {
  params: Promise<{ username: string; slug: string }>;
}) {
  const { username, slug } = await params;

  const resolved = await resolvePublicEventType({ username, slug });
  if (!resolved) {
    notFound();
  }

  const { hostUserId, host, eventType } = resolved;
  const hostName = host.displayName ?? host.username;

  const now = new Date();
  const rangeEnd = new Date(
    now.getTime() +
      Math.min(eventType.maxFutureMinutes * MS_PER_MINUTE, MAX_WINDOW_MS),
  );

  // Resolve the render outcome as plain data inside the try/catch; the JSX is
  // built afterward (constructing components inside try/catch does not catch
  // their render errors, and the linter rejects it).
  const outcome = await resolveOutcome({
    hostUserId,
    eventTypeId: eventType.id,
    now,
    rangeEnd,
  });

  return (
    <main className="min-h-screen px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <header className="mb-10">
          <p className="text-xs uppercase tracking-[0.2em] text-foreground-muted mb-4">
            {hostName}
          </p>
          <h1 className="text-3xl md:text-4xl font-medium text-foreground">
            {eventType.name}
          </h1>
          <p className="mt-3 text-sm text-foreground-muted">
            {formatDuration(eventType.durationMinutes)}
          </p>
          {eventType.description ? (
            <p className="mt-4 text-sm text-foreground-muted leading-relaxed whitespace-pre-line">
              {eventType.description}
            </p>
          ) : null}
        </header>
        {outcome.kind === "picker" ? (
          <BookingPicker slots={outcome.slots} eventTypeName={eventType.name} />
        ) : outcome.kind === "not-ready" ? (
          <StatePanel
            title="This booking page is not available yet"
            message="The host has not finished setting up their calendar. Check back soon."
          />
        ) : outcome.kind === "no-times" ? (
          <StatePanel
            title="No times are currently available"
            message="There are no open slots in the booking window right now. Check back soon."
          />
        ) : (
          <StatePanel
            title="Temporarily unavailable"
            message="We could not load this calendar. Please try again in a moment."
          />
        )}
      </div>
    </main>
  );
}

type Outcome =
  | { kind: "picker"; slots: { start: string; end: string }[] }
  | { kind: "not-ready" }
  | { kind: "no-times" }
  | { kind: "unavailable" };

/**
 * Run `getAvailableSlots` and reduce it to a render outcome. `NotBookableError`
 * is a 404 (`notFound()` throws). `CalendarUnavailableError` becomes the
 * unavailable state. A host with no connected calendar is "not ready" (its
 * slots were never verified against a real calendar, so they are not offered).
 */
async function resolveOutcome(args: {
  hostUserId: string;
  eventTypeId: string;
  now: Date;
  rangeEnd: Date;
}): Promise<Outcome> {
  try {
    const result = await getAvailableSlots({
      hostUserId: args.hostUserId,
      eventTypeId: args.eventTypeId,
      rangeStart: args.now,
      rangeEnd: args.rangeEnd,
      now: args.now,
    });

    if (!result.externalBusyChecked) {
      return { kind: "not-ready" };
    }
    if (result.slots.length === 0) {
      return { kind: "no-times" };
    }
    return {
      kind: "picker",
      slots: result.slots.map((s) => ({
        start: s.start.toISOString(),
        end: s.end.toISOString(),
      })),
    };
  } catch (err) {
    if (err instanceof NotBookableError) {
      notFound();
    }
    if (err instanceof CalendarUnavailableError) {
      return { kind: "unavailable" };
    }
    throw err;
  }
}
