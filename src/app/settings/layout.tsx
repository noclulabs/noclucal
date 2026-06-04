import Link from "next/link";

import { auth } from "@/auth";
import { signOutAction } from "./actions";
import { SettingsNav } from "./settings-nav";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  // proxy.ts protects every /settings route, so a session is present here.
  // Guard defensively anyway and fall back to a neutral label.
  const handle = session?.user?.username ?? "your account";

  return (
    <div className="min-h-screen md:flex">
      <aside className="flex flex-col border-b border-border bg-surface md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0 md:border-b-0 md:border-r">
        <div className="px-5 py-4 md:py-6">
          <Link
            href="/settings"
            className="text-base font-semibold tracking-tight text-foreground"
          >
            noClu<span className="text-primary">Cal</span>
          </Link>
        </div>

        <SettingsNav className="px-3 pb-4 md:flex-1 md:py-2" />

        <div className="mt-auto border-t border-border px-4 py-4">
          <p className="text-xs text-foreground-muted">Signed in as</p>
          <p className="mb-3 truncate text-sm font-medium text-foreground">
            {handle}
          </p>
          <form action={signOutAction}>
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-full border-[1.5px] border-border px-4 py-2 text-sm font-medium text-foreground-muted transition-colors hover:border-foreground-muted hover:text-foreground"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-3xl px-6 py-12 md:py-16">{children}</div>
      </main>
    </div>
  );
}
