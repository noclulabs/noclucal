import { auth } from "@/auth";
import {
  getHostSettings,
  listAvailabilityRulesForUser,
  listAvailabilityOverridesForUser,
} from "@/lib/availability/queries";
import { AvailabilityEditor } from "./availability-editor";
import { TimezonePicker } from "./timezone-picker";
import { OverridesEditor, type SeedOverride } from "./overrides-editor";

// Depends on the session cookie, so it must never be statically prerendered.
export const dynamic = "force-dynamic";

// Mirrors the host_settings.timezone column default; used until the user
// saves a row of their own.
const DEFAULT_TIMEZONE = "America/Los_Angeles";

export default async function AvailabilityPage() {
  const session = await auth();
  // proxy.ts protects this route; session is non-null here, but TS does
  // not know that without a runtime check.
  if (!session?.user?.id) {
    return null;
  }

  const [settings, rules, overrideRows] = await Promise.all([
    getHostSettings(session.user.id),
    listAvailabilityRulesForUser(session.user.id),
    listAvailabilityOverridesForUser(session.user.id),
  ]);

  const timezone = settings?.timezone ?? DEFAULT_TIMEZONE;
  // The time column returns "HH:MM:SS"; the editor's time inputs want "HH:MM".
  const initialRules = rules.map((rule) => ({
    weekday: rule.weekday,
    startTime: rule.startTime.slice(0, 5),
    endTime: rule.endTime.slice(0, 5),
  }));

  // Group the flat override rows by date into the editor's display shape. A
  // date is blocked when it has an `is_available` false row; otherwise its
  // ranges are the `is_available` true rows' times truncated to "HH:MM". Rows
  // arrive ordered by date then start, so Map insertion order is chronological.
  const overridesByDate = new Map<string, SeedOverride>();
  for (const row of overrideRows) {
    let entry = overridesByDate.get(row.date);
    if (!entry) {
      entry = { date: row.date, blocked: false, ranges: [] };
      overridesByDate.set(row.date, entry);
    }
    if (!row.isAvailable) {
      entry.blocked = true;
    } else if (row.startTime && row.endTime) {
      entry.ranges.push({
        startTime: row.startTime.slice(0, 5),
        endTime: row.endTime.slice(0, 5),
      });
    }
  }
  const initialOverrides = [...overridesByDate.values()];

  return (
    <main className="min-h-screen flex items-start justify-center px-6 py-16">
      <div className="max-w-2xl w-full">
        <p className="text-xs uppercase tracking-[0.2em] text-foreground-muted mb-6">
          Settings
        </p>
        <h1 className="text-3xl md:text-4xl font-medium mb-8 text-foreground">
          Availability
        </h1>

        <section className="bg-surface rounded-[20px] p-6 mb-6">
          <h2 className="text-lg font-medium text-foreground mb-4">Timezone</h2>
          <TimezonePicker currentTimezone={timezone} />
        </section>

        <section className="bg-surface rounded-[20px] p-6">
          <h2 className="text-lg font-medium text-foreground mb-1">
            Weekly hours
          </h2>
          <p className="text-sm text-foreground-muted mb-5">
            Set when you are available to be booked each week. A day with no
            ranges is unavailable.
          </p>
          <AvailabilityEditor initialRules={initialRules} />
        </section>

        <section className="bg-surface rounded-[20px] p-6 mt-6">
          <h2 className="text-lg font-medium text-foreground mb-1">
            Date overrides
          </h2>
          <p className="text-sm text-foreground-muted mb-5">
            Block a single date or give it custom hours that replace the weekly
            schedule for that day.
          </p>
          <OverridesEditor initialOverrides={initialOverrides} />
        </section>
      </div>
    </main>
  );
}
