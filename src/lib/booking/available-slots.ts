import { computeSlots } from "@/lib/scheduling/compute-slots";
import type {
  AvailabilityOverrideInput,
  AvailabilityRuleInput,
  BusyInterval,
  Slot,
} from "@/lib/scheduling/types";
import { getEventType } from "@/lib/event-types/queries";
import {
  getHostSettings,
  listAvailabilityOverridesForUser,
  listAvailabilityRulesForUser,
} from "@/lib/availability/queries";
import { listConfirmedBookingsInWindow } from "@/lib/bookings/queries";
import {
  getConnectionForUser,
  getValidTokensForConnection,
} from "@/lib/calendar/connections";
import { getProvider } from "@/lib/calendar/providers";
// Side-effecting import: registers the concrete calendar providers so the
// default resolver's `getProvider("google")` (and the refresh path inside
// `getValidTokensForConnection`) resolve. Tests never reach the default
// resolver (they inject a stub), so this only matters at runtime.
import "@/lib/calendar/providers/register-all";

const MS_PER_MINUTE = 60_000;

/**
 * Fallback host timezone when no `host_settings` row exists yet. Mirrors the
 * `host_settings.timezone` column default; the availability picker defaults to
 * the same value.
 */
const DEFAULT_HOST_TIMEZONE = "America/Los_Angeles";

/**
 * Thrown when the requested event type does not exist (or belongs to another
 * host) or is disabled. Callers surface this as "this page is not bookable"
 * rather than a 500.
 */
export class NotBookableError extends Error {
  constructor() {
    super("This event type is not available for booking.");
    this.name = "NotBookableError";
  }
}

/**
 * Thrown when the host has a connected calendar but its busy times could not
 * be read (token refresh failed, or the freebusy call failed). We refuse to
 * offer slots we could not verify against the host's real calendar rather than
 * risk a double booking. Distinct from the no-connection case, which degrades
 * gracefully (see CALENDAR-PLAYBOOK.md § Available-slots orchestration).
 */
export class CalendarUnavailableError extends Error {
  constructor() {
    super("Could not read the host calendar. Please try again.");
    this.name = "CalendarUnavailableError";
  }
}

export interface AvailableSlotsInput {
  hostUserId: string;
  eventTypeId: string;
  rangeStart: Date;
  rangeEnd: Date;
  now: Date;
}

export interface AvailableSlotsResult {
  slots: Slot[];
  /**
   * True when external (Google) busy was actually checked. False when the host
   * has no connected calendar, in which case slots come from availability and
   * internal bookings only. The caller decides how to present that.
   */
  externalBusyChecked: boolean;
}

/**
 * Resolves the host's external (Google) busy for a window. Returns
 * `connected: false` with an empty array when the host has no connection;
 * throws when a connection exists but cannot be read. Injected so tests run
 * without network.
 */
export type ExternalBusyResolver = (
  hostUserId: string,
  windowStart: Date,
  windowEnd: Date,
) => Promise<{ connected: boolean; busy: { start: Date; end: Date }[] }>;

/**
 * The default external-busy resolver: real connection lookup, token refresh,
 * and Google freebusy read. Returns `connected: false` when the host has no
 * Google connection. Lets a `RefreshFailedError` or a freebusy failure
 * propagate; `getAvailableSlots` wraps either as `CalendarUnavailableError`.
 */
const defaultResolveExternalBusy: ExternalBusyResolver = async (
  hostUserId,
  windowStart,
  windowEnd,
) => {
  const connection = await getConnectionForUser({
    userId: hostUserId,
    provider: "google",
  });
  if (!connection) {
    return { connected: false, busy: [] };
  }

  const tokens = await getValidTokensForConnection(connection.id);
  const provider = getProvider("google");
  const byCalendar = await provider.getFreeBusy({
    tokens,
    calendarIds: ["primary"],
    timeMin: windowStart,
    timeMax: windowEnd,
  });

  const busy: { start: Date; end: Date }[] = [];
  for (const blocks of byCalendar.values()) {
    for (const block of blocks) {
      busy.push({ start: block.start, end: block.end });
    }
  }
  return { connected: true, busy };
};

/**
 * Produce the bookable slots for a host's event type within a window. The
 * first runtime consumer of the pure `computeSlots` engine: it does real I/O
 * (database reads and, by default, a Google freebusy call) and feeds the
 * engine `busy = external ∪ internal`, where external is the host's live
 * Google freebusy and internal is the host's own confirmed bookings.
 *
 * Read-only: no booking is written here (that is Phase 4d). URL resolution
 * (public username + event-type slug to ids) is the caller's concern (4c).
 *
 * - No calendar connection: compute from availability and internal bookings
 *   only and return `externalBusyChecked: false`. Does not fail.
 * - Connection present but unreadable: throws `CalendarUnavailableError`.
 * - Event type missing or disabled: throws `NotBookableError`.
 *
 * The external-busy fetch is injectable so tests run without network. Full
 * rationale in CALENDAR-PLAYBOOK.md § Available-slots orchestration.
 */
export async function getAvailableSlots(
  input: AvailableSlotsInput,
  deps?: { resolveExternalBusy?: ExternalBusyResolver },
): Promise<AvailableSlotsResult> {
  const { hostUserId, eventTypeId, rangeStart, rangeEnd, now } = input;

  // 1. Load and gate the event type.
  const eventType = await getEventType({ userId: hostUserId, id: eventTypeId });
  if (!eventType || !eventType.enabled) {
    throw new NotBookableError();
  }

  // 2. Host timezone, falling back to the column default when no row exists.
  const hostSettings = await getHostSettings(hostUserId);
  const hostTimezone = hostSettings?.timezone ?? DEFAULT_HOST_TIMEZONE;

  // 3. Availability rules and overrides, mapped to the engine input shapes.
  //    The `time` column round-trips as "HH:MM:SS"; truncate to "HH:MM".
  const [ruleRows, overrideRows] = await Promise.all([
    listAvailabilityRulesForUser(hostUserId),
    listAvailabilityOverridesForUser(hostUserId),
  ]);
  const availabilityRules: AvailabilityRuleInput[] = ruleRows.map((r) => ({
    weekday: r.weekday,
    startTime: r.startTime.slice(0, 5),
    endTime: r.endTime.slice(0, 5),
  }));
  const availabilityOverrides: AvailabilityOverrideInput[] = overrideRows.map(
    (o) => ({
      date: o.date,
      isAvailable: o.isAvailable,
      startTime: o.startTime ? o.startTime.slice(0, 5) : null,
      endTime: o.endTime ? o.endTime.slice(0, 5) : null,
    }),
  );

  // 4. Freebusy window: the requested range expanded on each side by the larger
  //    buffer, so a busy block just outside the range still blocks an edge slot.
  const maxBufferMs =
    Math.max(eventType.bufferBeforeMinutes, eventType.bufferAfterMinutes) *
    MS_PER_MINUTE;
  const windowStart = new Date(rangeStart.getTime() - maxBufferMs);
  const windowEnd = new Date(rangeEnd.getTime() + maxBufferMs);

  // 5. Internal busy: the host's own confirmed bookings overlapping the window.
  const internalRows = await listConfirmedBookingsInWindow(
    hostUserId,
    windowStart,
    windowEnd,
  );
  const internalBusy: BusyInterval[] = internalRows.map((b) => ({
    start: b.startsAt,
    end: b.endsAt,
  }));

  // 6. External busy: live Google freebusy, behind the injectable seam. A
  //    missing connection degrades; any throw becomes CalendarUnavailableError.
  const resolveExternalBusy =
    deps?.resolveExternalBusy ?? defaultResolveExternalBusy;
  let external: { connected: boolean; busy: { start: Date; end: Date }[] };
  try {
    external = await resolveExternalBusy(hostUserId, windowStart, windowEnd);
  } catch {
    throw new CalendarUnavailableError();
  }
  const externalBusy: BusyInterval[] = external.busy.map((b) => ({
    start: b.start,
    end: b.end,
  }));

  // 7. Union, then 8. compute.
  const busy: BusyInterval[] = [...internalBusy, ...externalBusy];
  const slots = computeSlots({
    now,
    rangeStart,
    rangeEnd,
    hostTimezone,
    availabilityRules,
    availabilityOverrides,
    eventType: {
      durationMinutes: eventType.durationMinutes,
      bufferBeforeMinutes: eventType.bufferBeforeMinutes,
      bufferAfterMinutes: eventType.bufferAfterMinutes,
      minNoticeMinutes: eventType.minNoticeMinutes,
      maxFutureMinutes: eventType.maxFutureMinutes,
      slotGranularityMinutes: eventType.slotGranularityMinutes,
    },
    busy,
  });

  return { slots, externalBusyChecked: external.connected };
}
