import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { upsertNoclucalUser } from "@/lib/auth/upsert-noclucal-user";

// Defensive: also marks the page as dynamic so Next does not try to
// statically prerender a route that depends on the session cookie.
export const dynamic = "force-dynamic";

export default async function MePage() {
  const session = await auth();

  // The proxy should have redirected unauthenticated visitors before they
  // reach this point. This guard catches a misconfig where the proxy did
  // not run (e.g., the matcher entry is missing) or a stale session.
  if (!session?.user) {
    redirect("/");
  }

  // Lazy upsert. Best-effort: if the DB is unreachable or the write fails,
  // we still render the page from the JWT contents.
  try {
    await upsertNoclucalUser({
      id: session.user.id,
      username: session.user.username,
      displayName: session.user.name ?? null,
    });
  } catch (err) {
    console.error("[me] upsertNoclucalUser failed:", err);
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-16">
      <div className="max-w-xl w-full text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-foreground-muted mb-6">
          noClu suite
        </p>
        <h1 className="text-3xl md:text-4xl font-medium mb-6 text-foreground">
          Signed in as {session.user.username}
        </h1>
        <div className="text-left bg-surface rounded-[20px] p-6 space-y-2 text-sm font-mono">
          <div>
            <span className="text-foreground-muted">id: </span>
            {session.user.id}
          </div>
          <div>
            <span className="text-foreground-muted">username: </span>
            {session.user.username}
          </div>
          <div>
            <span className="text-foreground-muted">role: </span>
            {session.user.role}
          </div>
        </div>
        <p className="mt-6 text-sm text-foreground-muted">
          Session forwarded from{" "}
          <a
            href="https://noclulabs.com"
            className="text-primary hover:underline"
          >
            noClu
          </a>{" "}
          via shared session cookie.
        </p>
      </div>
    </main>
  );
}
