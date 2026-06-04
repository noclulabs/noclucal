/**
 * Input and output types for the slot computation engine.
 *
 * The engine is pure: every input is an argument and every absolute instant
 * is a JS `Date` in UTC. Wall-clock availability times are strings in the
 * host's local clock, interpreted against `hostTimezone`. See
 * `src/lib/scheduling/compute-slots.ts` and CLAUDE.md's `## Slot computation`
 * section for the reasoning.
 */

/** A busy interval read from an external calendar. Both ends are UTC instants. */
export interface BusyInterval {
  start: Date;
  end: Date;
}

/** A recurring weekly availability window in the host's wall clock. */
export interface AvailabilityRuleInput {
  weekday: number; // ISO 1 to 7, Monday = 1, Sunday = 7
  startTime: string; // "HH:MM" or "HH:MM:SS"
  endTime: string; // "HH:MM" or "HH:MM:SS"
}

/** A date-specific availability exception in the host's wall clock. */
export interface AvailabilityOverrideInput {
  date: string; // "YYYY-MM-DD"
  isAvailable: boolean;
  startTime: string | null; // null when isAvailable is false
  endTime: string | null; // null when isAvailable is false
}

/** Event type fields that shape slot generation. Integer minutes throughout. */
export interface EventTypeConfig {
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minNoticeMinutes: number;
  maxFutureMinutes: number;
  slotGranularityMinutes: number;
}

export interface ComputeSlotsInput {
  now: Date; // reference instant, UTC
  rangeStart: Date; // earliest instant the caller wants slots within, UTC
  rangeEnd: Date; // latest instant the caller wants slots within, UTC
  hostTimezone: string; // IANA zone, from host_settings
  availabilityRules: AvailabilityRuleInput[];
  availabilityOverrides: AvailabilityOverrideInput[];
  eventType: EventTypeConfig;
  busy: BusyInterval[];
}

/** A bookable slot. Both ends are UTC instants; end is start plus duration. */
export interface Slot {
  start: Date;
  end: Date;
}
