import Link from "next/link";

import { auth } from "@/auth";
import { getConnectionForUser } from "@/lib/calendar/connections";
import {
  getHostSettings,
  listAvailabilityRulesForUser,
} from "@/lib/availability/queries";
import { listEventTypesForUser } from "@/lib/event-types/queries";

// Depends on the session cookie, so it must never be statically prerendered.
export const dynamic = "force-dynamic";

// Mirrors the host_settings.timezone column default; shown until the user
// saves a timezone of their own.
const DEFAULT_TIMEZONE = "America/Los_Angeles";

export default async function SettingsOverviewPage() {
  const session = await auth();
  // proxy.ts protects this route; session is non-null here, but TS does not
  // know that without a runtime check.
  if (!session?.user?.id) {
    return null;
  }
  const userId = session.user.id;

  // Read-only status sourcing: every card reads an existing query, no new
  // data-access is introduced here.
  const [connection, eventTypes, rules, settings] = await Promise.all([
    getConnectionForUser({ userId, provider: "google" }),
    listEventTypesForUser(userId),
    listAvailabilityRulesForUser(userId),
    getHostSettings(userId),
  ]);

  const eventTypeCount = eventTypes.length;
  const hasHours = rules.length > 0;
  const timezone = settings?.timezone ?? DEFAULT_TIMEZONE;

  return (
    <>
      <h1 className="text-3xl font-medium text-foreground md:text-4xl">
        Overview
      </h1>
      <p className="mb-10 mt-2 text-sm text-foreground-muted">
        Signed in as {session.user.username}.
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <OverviewCard
          href="/settings/calendars"
          label="Calendar"
          value={connection ? connection.externalAccountEmail : "Not connected"}
          hint={connection ? "Google Calendar" : "Connect Google Calendar"}
        />
        <OverviewCard
          href="/settings/event-types"
          label="Event types"
          value={
            eventTypeCount === 0
              ? "None yet"
              : `${eventTypeCount} ${eventTypeCount === 1 ? "event type" : "event types"}`
          }
          hint={
            eventTypeCount === 0
              ? "Create your first event type"
              : "Manage event types"
          }
        />
        <OverviewCard
          href="/settings/availability"
          label="Availability"
          value={hasHours ? "Weekly hours set" : "No hours set"}
          hint={timezone}
        />
      </div>

      <p className="mt-10 text-sm text-foreground-muted">
        Your public booking page arrives in a later phase.
      </p>
    </>
  );
}

function OverviewCard({
  href,
  label,
  value,
  hint,
}: {
  href: string;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-[20px] bg-surface p-5 transition-colors hover:bg-surface-elevated"
    >
      <p className="text-xs uppercase tracking-[0.2em] text-foreground-muted">
        {label}
      </p>
      <p className="mt-3 truncate text-base font-medium text-foreground">
        {value}
      </p>
      <p className="mt-1 truncate text-xs text-foreground-muted">{hint}</p>
    </Link>
  );
}
