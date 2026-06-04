import { DateTime } from "luxon";

import { intervalsOverlap, mergeIntervals } from "./intervals";
import type { NumericInterval } from "./intervals";
import type {
  AvailabilityOverrideInput,
  AvailabilityRuleInput,
  ComputeSlotsInput,
  Slot,
} from "./types";

const MS_PER_MINUTE = 60_000;

/**
 * Convert a wall-clock minute-of-day on a given date in the host zone to a
 * UTC instant. Returns null when the local time does not exist (the spring
 * forward gap). Luxon forward-shifts nonexistent local times but keeps them
 * valid, so the reliable detector is confirming the local fields round-trip.
 */
function wallClockToInstant(
  dateStr: string,
  minutesFromMidnight: number,
  zone: string,
): Date | null {
  const hour = Math.floor(minutesFromMidnight / 60);
  const minute = minutesFromMidnight % 60;
  const [year, month, day] = dateStr.split("-").map(Number);
  const dt = DateTime.fromObject({ year, month, day, hour, minute }, { zone });
  if (!dt.isValid) return null;
  if (dt.hour !== hour || dt.minute !== minute) return null;
  return dt.toJSDate();
}

/**
 * Parse "HH:MM" or "HH:MM:SS" into minutes from midnight. Seconds are
 * ignored: slot math runs in whole minutes.
 */
function parseTimeToMinutes(time: string): number {
  const [hourPart, minutePart] = time.split(":");
  return Number(hourPart) * 60 + Number(minutePart);
}

/**
 * Resolve a day's wall-clock windows (minutes from midnight) using
 * replace-with-block-wins composition. A date with any override row ignores
 * the recurring weekly rules; any full-day block on the date wins and yields
 * zero windows; otherwise the windows are the union of the day's available
 * override rows, or of the recurring rules for the day's ISO weekday.
 */
function resolveDayWindows(
  dateStr: string,
  weekday: number,
  rules: AvailabilityRuleInput[],
  overrides: AvailabilityOverrideInput[],
): NumericInterval[] {
  const dayOverrides = overrides.filter((o) => o.date === dateStr);

  let raw: NumericInterval[];
  if (dayOverrides.length > 0) {
    if (dayOverrides.some((o) => o.isAvailable === false)) {
      return [];
    }
    raw = dayOverrides
      .filter((o) => o.startTime !== null && o.endTime !== null)
      .map((o) => ({
        start: parseTimeToMinutes(o.startTime as string),
        end: parseTimeToMinutes(o.endTime as string),
      }));
  } else {
    raw = rules
      .filter((r) => r.weekday === weekday)
      .map((r) => ({
        start: parseTimeToMinutes(r.startTime),
        end: parseTimeToMinutes(r.endTime),
      }));
  }

  // Merge overlapping or adjacent windows so a union never emits a duplicate
  // slot start at a seam.
  return mergeIntervals(raw);
}

/**
 * Pure, deterministic slot computation. Given a reference clock, a requested
 * range, the host timezone, availability rules and overrides, an event type
 * config, and busy intervals, return the bookable slots as UTC instants,
 * sorted ascending by start with duplicate starts removed.
 *
 * No system clock read, no DB access, no network. The invitee timezone is
 * deliberately not an input: slots are timezone-agnostic instants, and
 * rendering them in the invitee's zone is a UI concern. See CLAUDE.md's
 * `## Slot computation` section for the full rationale.
 */
export function computeSlots(input: ComputeSlotsInput): Slot[] {
  const {
    now,
    rangeStart,
    rangeEnd,
    hostTimezone,
    availabilityRules,
    availabilityOverrides,
    eventType,
    busy,
  } = input;

  const {
    durationMinutes,
    bufferBeforeMinutes,
    bufferAfterMinutes,
    minNoticeMinutes,
    maxFutureMinutes,
    slotGranularityMinutes,
  } = eventType;

  // A non-positive granularity would never advance the candidate loop; guard
  // against it so the function cannot hang on malformed config.
  if (slotGranularityMinutes <= 0) return [];

  if (rangeStart.getTime() >= rangeEnd.getTime()) return [];

  // Clamp the requested range by min-notice and max-future, both anchored on
  // `now`. The effective window is the intersection.
  const noticeFloor = now.getTime() + minNoticeMinutes * MS_PER_MINUTE;
  const futureCeil = now.getTime() + maxFutureMinutes * MS_PER_MINUTE;
  const effectiveStartMs = Math.max(rangeStart.getTime(), noticeFloor);
  const effectiveEndMs = Math.min(rangeEnd.getTime(), futureCeil);

  if (effectiveStartMs >= effectiveEndMs) return [];

  // Precompute busy intervals in epoch milliseconds once.
  const busyMs: NumericInterval[] = busy.map((b) => ({
    start: b.start.getTime(),
    end: b.end.getTime(),
  }));

  // Iterate host-timezone calendar days from the day containing the effective
  // start to the day containing the effective end, inclusive. plus({ days: 1 })
  // is DST-aware (it lands on the next local midnight regardless of a 23 or 25
  // hour day).
  const firstDay = DateTime.fromMillis(effectiveStartMs, {
    zone: hostTimezone,
  }).startOf("day");
  const lastDay = DateTime.fromMillis(effectiveEndMs, {
    zone: hostTimezone,
  }).startOf("day");

  const slots: Slot[] = [];

  for (
    let cursor = firstDay;
    cursor.isValid && cursor.toMillis() <= lastDay.toMillis();
    cursor = cursor.plus({ days: 1 })
  ) {
    const dateStr = cursor.toISODate();
    if (dateStr === null) continue;
    const weekday = cursor.weekday; // ISO 1 to 7, matches AvailabilityRuleInput

    const windows = resolveDayWindows(
      dateStr,
      weekday,
      availabilityRules,
      availabilityOverrides,
    );

    for (const window of windows) {
      // Step in wall-clock minutes from the window start. A slot must fit
      // fully inside the window by nominal duration; the slot end instant is
      // real time, computed below, so a meeting spanning a DST transition is
      // still its nominal number of real minutes.
      for (
        let candidateStart = window.start;
        candidateStart + durationMinutes <= window.end;
        candidateStart += slotGranularityMinutes
      ) {
        const startInstant = wallClockToInstant(
          dateStr,
          candidateStart,
          hostTimezone,
        );
        // Nonexistent local time (spring-forward gap): skip.
        if (startInstant === null) continue;

        const endInstant = new Date(
          startInstant.getTime() + durationMinutes * MS_PER_MINUTE,
        );

        // Buffers block against any busy interval, half-open, in real time.
        const guard: NumericInterval = {
          start: startInstant.getTime() - bufferBeforeMinutes * MS_PER_MINUTE,
          end: endInstant.getTime() + bufferAfterMinutes * MS_PER_MINUTE,
        };
        if (busyMs.some((b) => intervalsOverlap(guard, b))) continue;

        // Clamp on the slot start: at or after the effective start, strictly
        // before the effective end.
        const startMs = startInstant.getTime();
        if (startMs < effectiveStartMs || startMs >= effectiveEndMs) continue;

        slots.push({ start: startInstant, end: endInstant });
      }
    }
  }

  // Sort ascending by start, then drop any slot whose start matches the
  // previous one (belt-and-suspenders after the per-day window merge).
  slots.sort((a, b) => a.start.getTime() - b.start.getTime());
  const deduped: Slot[] = [];
  for (const slot of slots) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.start.getTime() === slot.start.getTime()) continue;
    deduped.push(slot);
  }
  return deduped;
}
