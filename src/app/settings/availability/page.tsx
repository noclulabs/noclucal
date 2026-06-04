import { auth } from "@/auth";
import {
  getHostSettings,
  listAvailabilityRulesForUser,
} from "@/lib/availability/queries";
import { AvailabilityEditor } from "./availability-editor";
import { TimezonePicker } from "./timezone-picker";

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

  const [settings, rules] = await Promise.all([
    getHostSettings(session.user.id),
    listAvailabilityRulesForUser(session.user.id),
  ]);

  const timezone = settings?.timezone ?? DEFAULT_TIMEZONE;
  // The time column returns "HH:MM:SS"; the editor's time inputs want "HH:MM".
  const initialRules = rules.map((rule) => ({
    weekday: rule.weekday,
    startTime: rule.startTime.slice(0, 5),
    endTime: rule.endTime.slice(0, 5),
  }));

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
      </div>
    </main>
  );
}
