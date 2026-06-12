import { DateTime } from "luxon";

/**
 * Formats a UTC instant for email copy, rendered in the given IANA timezone:
 * `Thursday, June 18, 2026 at 2:30 PM PDT`.
 *
 * No reusable helper existed for this: the only display formatting in the
 * codebase lives inline in the `"use client"` booking picker, which a
 * server-rendered email cannot import. This mirrors that picker's confirmed-
 * booking format (weekday and date, then time, then zone abbreviation), with
 * the year added because an email is read outside the booking context.
 *
 * The locale is fixed to en-US so the output is deterministic across
 * environments (the picker renders in the visitor's browser locale instead;
 * that is a UI concern, not an email one). An unparseable instant or unknown
 * timezone falls back to the raw ISO string, matching how the picker's
 * confirmation panel degrades.
 */
export function formatInstantForEmail(utcIso: string, timezone: string): string {
  const dt = DateTime.fromISO(utcIso, { zone: timezone }).setLocale("en-US");
  if (!dt.isValid) {
    return utcIso;
  }
  return `${dt.toFormat("cccc, LLLL d, yyyy")} at ${dt.toFormat("h:mm a")} ${dt.toFormat("ZZZZ")}`;
}
