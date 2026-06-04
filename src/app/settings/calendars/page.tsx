import { auth } from "@/auth";
import { getConnectionForUser } from "@/lib/calendar/connections";
import { disconnectGoogleCalendar } from "./actions";

// Defensive: also marks the page as dynamic so Next does not try to
// statically prerender a route that depends on the session cookie.
export const dynamic = "force-dynamic";

interface SearchParams {
  error?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  session_lost:
    "Your session expired while connecting. Sign in again and retry.",
  missing_params:
    "Google did not return the expected response. Try connecting again.",
  state_mismatch:
    "Authorization state did not match. This can happen if the browser session changed mid-flow. Try again.",
  exchange_failed:
    "Could not complete the Google authorization. Try again, or contact support if it persists.",
  access_denied: "You declined the Google permission request.",
};

export default async function CalendarsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  // proxy.ts protects this route; session is non-null here, but TS does
  // not know that without a runtime check.
  if (!session?.user?.id) {
    return null;
  }

  const connection = await getConnectionForUser({
    userId: session.user.id,
    provider: "google",
  });

  const params = await searchParams;
  const errorMessage = params.error
    ? (ERROR_MESSAGES[params.error] ??
      `An unexpected error occurred: ${params.error}`)
    : null;

  return (
    <>
      <h1 className="text-3xl md:text-4xl font-medium mb-8 text-foreground">
        Connected calendars
      </h1>

      {errorMessage ? (
        <div className="mb-8 rounded-[20px] border-[1.5px] border-border bg-surface px-5 py-4 text-sm text-foreground-muted">
          {errorMessage}
        </div>
      ) : null}

      <section className="bg-surface rounded-[20px] p-6">
        <h2 className="text-lg font-medium text-foreground mb-4">
          Google Calendar
        </h2>
        {connection ? (
          <div className="space-y-4">
            <p className="text-sm text-foreground-muted">
              Connected as{" "}
              <strong className="text-foreground font-medium">
                {connection.externalAccountEmail}
              </strong>
            </p>
            <form action={disconnectGoogleCalendar}>
              <button
                type="submit"
                className="inline-flex items-center rounded-full border-[1.5px] border-border px-5 py-2 text-sm font-medium text-foreground transition-colors hover:border-foreground-muted"
              >
                Disconnect
              </button>
            </form>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-foreground-muted">
              No Google account connected.
            </p>
            <a
              href="/api/calendar/google/connect"
              className="inline-flex items-center rounded-full border-[1.5px] border-primary px-5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-canvas"
            >
              Connect Google Calendar
            </a>
          </div>
        )}
      </section>
    </>
  );
}
