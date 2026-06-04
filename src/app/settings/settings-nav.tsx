"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  label: string;
  href: string;
  // A forward-looking item that links to its placeholder rather than a live
  // feature. Rendered with a quiet "soon" badge.
  soon?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/settings" },
  { label: "Event types", href: "/settings/event-types" },
  { label: "Availability", href: "/settings/availability" },
  { label: "Calendars", href: "/settings/calendars" },
  { label: "Bookings", href: "/settings/bookings", soon: true },
];

// Overview owns the bare /settings route, so it matches only on an exact path;
// every other item also matches its nested routes (e.g. an event type editor).
function isActive(pathname: string, href: string): boolean {
  if (href === "/settings") {
    return pathname === "/settings";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SettingsNav({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav className={className} aria-label="Settings sections">
      <ul className="flex flex-row gap-1 overflow-x-auto md:flex-col">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex items-center justify-between gap-2 rounded-full px-4 py-2 text-sm transition-colors",
                  active
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-foreground-muted hover:bg-surface-elevated hover:text-foreground",
                ].join(" ")}
              >
                <span>{item.label}</span>
                {item.soon ? (
                  <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-[10px] uppercase tracking-wide text-foreground-muted">
                    soon
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
