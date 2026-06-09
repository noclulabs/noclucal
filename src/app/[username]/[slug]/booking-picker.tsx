"use client";

import { useId, useMemo, useState, useSyncExternalStore } from "react";
import { DateTime } from "luxon";

interface SlotInput {
  start: string; // ISO UTC instant
  end: string; // ISO UTC instant
}

interface BookingPickerProps {
  slots: SlotInput[];
  eventTypeName: string;
}

interface DayGroup {
  key: string; // "YYYY-MM-DD" in the selected zone
  label: string; // "Wed, Jul 1"
  slots: { iso: string; dt: DateTime }[];
}

/** IANA zones the browser knows about, with the current value guaranteed to be
 *  present even if the runtime list omits it. */
function supportedTimezones(current: string): string[] {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf("timeZone");
  } catch {
    zones = [];
  }
  if (current && !zones.includes(current)) {
    zones = [current, ...zones];
  }
  return zones;
}

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

const emptySubscribe = () => () => {};

/**
 * The visitor's IANA timezone, or null on the server and during the first
 * hydration pass. Reading it through an external-store snapshot (rather than a
 * `useEffect` + `setState`) keeps the server and first client render in
 * agreement, so there is no hydration mismatch and no set-state-in-effect.
 */
function useDetectedTimezone(): string | null {
  return useSyncExternalStore(
    emptySubscribe,
    () => detectTimezone(),
    () => null,
  );
}

/**
 * Browse and select a bookable time. The slots arrive as UTC instants (the
 * engine is timezone-agnostic); this component groups them into the invitee's
 * local days with Luxon and renders day-then-time selection. Selecting a time
 * ends at a summary: the form, confirm, and booking write are Phase 4d.
 */
export function BookingPicker({ slots, eventTypeName }: BookingPickerProps) {
  // The invitee's detected zone (null until hydration completes) and their
  // optional override from the selector. The override wins once chosen.
  const detected = useDetectedTimezone();
  const [override, setOverride] = useState<string | null>(null);
  const timezone = override ?? detected;
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [selectedIso, setSelectedIso] = useState<string | null>(null);
  const selectId = useId();

  const days = useMemo<DayGroup[]>(() => {
    if (!timezone) return [];
    const byDay = new Map<string, DayGroup>();
    for (const slot of slots) {
      const dt = DateTime.fromISO(slot.start, { zone: timezone });
      if (!dt.isValid) continue;
      const key = dt.toISODate();
      if (!key) continue;
      let group = byDay.get(key);
      if (!group) {
        group = { key, label: dt.toFormat("ccc, LLL d"), slots: [] };
        byDay.set(key, group);
      }
      group.slots.push({ iso: slot.start, dt });
    }
    const groups = Array.from(byDay.values());
    groups.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    for (const group of groups) {
      group.slots.sort((a, b) => a.dt.toMillis() - b.dt.toMillis());
    }
    return groups;
  }, [slots, timezone]);

  // Keep the active day valid as the zone (and therefore the grouping) changes.
  const activeDayKey =
    selectedDayKey && days.some((d) => d.key === selectedDayKey)
      ? selectedDayKey
      : (days[0]?.key ?? null);
  const activeDay = days.find((d) => d.key === activeDayKey) ?? null;

  const selectedSlot =
    selectedIso && days.some((d) => d.slots.some((s) => s.iso === selectedIso))
      ? (days
          .flatMap((d) => d.slots)
          .find((s) => s.iso === selectedIso)?.dt ?? null)
      : null;

  if (!timezone) {
    return (
      <section className="bg-surface rounded-[20px] p-8 text-center">
        <p className="text-sm text-foreground-muted">Loading available times</p>
      </section>
    );
  }

  const zones = supportedTimezones(timezone);

  return (
    <div className="space-y-6">
      <div>
        <label
          htmlFor={selectId}
          className="block text-sm font-medium text-foreground mb-2"
        >
          Times shown in
        </label>
        <select
          id={selectId}
          value={timezone}
          onChange={(e) => {
            setOverride(e.target.value);
            setSelectedIso(null);
          }}
          className="w-full rounded-[12px] border-[1.5px] border-border bg-canvas px-4 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary"
        >
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        {days.map((day) => {
          const active = day.key === activeDayKey;
          return (
            <button
              key={day.key}
              type="button"
              onClick={() => {
                setSelectedDayKey(day.key);
                setSelectedIso(null);
              }}
              className={`inline-flex items-center rounded-full border-[1.5px] px-4 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "border-primary bg-primary text-canvas"
                  : "border-border text-foreground hover:border-foreground-muted"
              }`}
            >
              {day.label}
            </button>
          );
        })}
      </div>

      {activeDay ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {activeDay.slots.map((slot) => {
            const active = slot.iso === selectedIso;
            return (
              <button
                key={slot.iso}
                type="button"
                onClick={() => setSelectedIso(slot.iso)}
                className={`inline-flex items-center justify-center rounded-[12px] border-[1.5px] px-4 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "border-primary bg-primary text-canvas"
                    : "border-border text-foreground hover:border-primary"
                }`}
              >
                {slot.dt.toLocaleString(DateTime.TIME_SIMPLE)}
              </button>
            );
          })}
        </div>
      ) : null}

      {selectedSlot ? (
        <section className="bg-surface-elevated rounded-[20px] p-6">
          <p className="text-sm text-foreground">
            Booking {eventTypeName} on{" "}
            {selectedSlot.toFormat("cccc, LLLL d")} at{" "}
            {selectedSlot.toLocaleString(DateTime.TIME_SIMPLE)}{" "}
            {selectedSlot.toFormat("ZZZZ")}
          </p>
          <p className="mt-2 text-xs text-foreground-muted">
            Completing the booking is coming soon.
          </p>
        </section>
      ) : null}
    </div>
  );
}
