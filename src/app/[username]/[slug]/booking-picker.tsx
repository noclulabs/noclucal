"use client";

import {
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";

import { confirmBooking, type ConfirmBookingResult } from "./actions";

interface SlotInput {
  start: string; // ISO UTC instant
  end: string; // ISO UTC instant
}

interface BookingPickerProps {
  slots: SlotInput[];
  eventTypeName: string;
  hostName: string;
  username: string;
  slug: string;
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
 * Browse, select, and book a time. The slots arrive as UTC instants (the engine
 * is timezone-agnostic); this component groups them into the invitee's local
 * days with Luxon, then collects the invitee's details and calls the
 * `confirmBooking` server action. Selection, the form, and every result state
 * (success, conflict, no-longer-available, validation errors) render here.
 */
export function BookingPicker({
  slots,
  eventTypeName,
  hostName,
  username,
  slug,
}: BookingPickerProps) {
  // The invitee's detected zone (null until hydration completes) and their
  // optional override from the selector. The override wins once chosen.
  const detected = useDetectedTimezone();
  const [override, setOverride] = useState<string | null>(null);
  const timezone = override ?? detected;
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [selectedIso, setSelectedIso] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<ConfirmBookingResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const selectId = useId();
  const nameId = useId();
  const emailId = useId();
  const noteId = useId();
  const router = useRouter();

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

  // The success panel replaces the picker entirely: there is nothing more to do.
  if (result?.status === "success") {
    return (
      <Confirmation confirmation={result.confirmation} hostName={hostName} />
    );
  }

  if (!timezone) {
    return (
      <section className="bg-surface rounded-[20px] p-8 text-center">
        <p className="text-sm text-foreground-muted">Loading available times</p>
      </section>
    );
  }

  const zones = supportedTimezones(timezone);
  const fieldErrors = result?.status === "invalid" ? result.errors : {};

  function selectSlot(iso: string | null) {
    setSelectedIso(iso);
    // A fresh selection clears any prior conflict / unavailable / invalid state.
    setResult(null);
  }

  function chooseAnother() {
    setSelectedIso(null);
    setResult(null);
    // Pull a fresh slot list from the server so a just-taken time disappears.
    router.refresh();
  }

  function submit() {
    if (!selectedIso || !timezone || isPending) return;
    const chosen = slots.find((s) => s.start === selectedIso);
    if (!chosen) return;
    startTransition(async () => {
      const res = await confirmBooking({
        username,
        slug,
        startIso: chosen.start,
        endIso: chosen.end,
        name,
        email,
        note: note.trim() ? note : undefined,
        inviteeTimezone: timezone,
      });
      setResult(res);
    });
  }

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
            selectSlot(null);
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
                selectSlot(null);
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
                onClick={() => selectSlot(slot.iso)}
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
        <section className="bg-surface-elevated rounded-[20px] p-6 space-y-5">
          <p className="text-sm text-foreground">
            Booking {eventTypeName} on{" "}
            {selectedSlot.toFormat("cccc, LLLL d")} at{" "}
            {selectedSlot.toLocaleString(DateTime.TIME_SIMPLE)}{" "}
            {selectedSlot.toFormat("ZZZZ")}
          </p>

          {result?.status === "conflict" || result?.status === "unavailable" ? (
            <div className="space-y-3">
              <p className="text-sm text-foreground-muted">
                {result.status === "conflict"
                  ? "That time was just booked. Pick another."
                  : "That time is no longer available. Pick another."}
              </p>
              <button
                type="button"
                onClick={chooseAnother}
                className="inline-flex items-center rounded-full border-[1.5px] border-primary px-5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-canvas"
              >
                Choose another time
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <Field id={nameId} label="Name" error={fieldErrors.name}>
                <input
                  id={nameId}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  className="w-full rounded-[12px] border-[1.5px] border-border bg-canvas px-4 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary"
                />
              </Field>

              <Field id={emailId} label="Email" error={fieldErrors.email}>
                <input
                  id={emailId}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="w-full rounded-[12px] border-[1.5px] border-border bg-canvas px-4 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary"
                />
              </Field>

              <Field id={noteId} label="Note (optional)" error={fieldErrors.note}>
                <textarea
                  id={noteId}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  className="w-full rounded-[12px] border-[1.5px] border-border bg-canvas px-4 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary resize-none"
                />
              </Field>

              {result?.status === "not_bookable" ? (
                <p className="text-sm text-foreground-muted">
                  This booking page is no longer available.
                </p>
              ) : null}

              <button
                type="button"
                onClick={submit}
                disabled={isPending}
                className="inline-flex items-center rounded-full border-[1.5px] border-primary bg-primary px-6 py-2.5 text-sm font-medium text-canvas transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {isPending ? "Confirming" : "Confirm booking"}
              </button>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

/** A labelled form field with an optional inline error message. */
function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-medium text-foreground mb-2"
      >
        {label}
      </label>
      {children}
      {error ? <p className="mt-1.5 text-xs text-primary">{error}</p> : null}
    </div>
  );
}

/** The in-place success state: the booking is confirmed. */
function Confirmation({
  confirmation,
  hostName,
}: {
  confirmation: NonNullable<
    Extract<ConfirmBookingResult, { status: "success" }>
  >["confirmation"];
  hostName: string;
}) {
  const start = DateTime.fromISO(confirmation.startIso, {
    zone: confirmation.inviteeTimezone,
  });
  const when = start.isValid
    ? `${start.toFormat("cccc, LLLL d")} at ${start.toLocaleString(
        DateTime.TIME_SIMPLE,
      )} ${start.toFormat("ZZZZ")}`
    : confirmation.startIso;

  return (
    <section className="bg-surface rounded-[20px] p-8 space-y-4">
      <p className="text-base font-medium text-foreground">Booking confirmed</p>
      <div className="space-y-1 text-sm text-foreground-muted">
        <p>
          {confirmation.eventName} with {hostName}
        </p>
        <p>{when}</p>
      </div>
      {confirmation.meetLink ? (
        <a
          href={confirmation.meetLink}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center rounded-full border-[1.5px] border-primary px-5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-canvas"
        >
          Join with Google Meet
        </a>
      ) : null}
      <p className="text-xs text-foreground-muted">
        A calendar invitation has been sent to {confirmation.inviteeEmail}.
      </p>
    </section>
  );
}
