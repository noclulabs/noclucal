"use client";

import { useActionState, useId, useState } from "react";
import { saveTimezoneAction, type AvailabilityFormState } from "./actions";

interface TimezonePickerProps {
  currentTimezone: string;
}

/** IANA zones the browser knows about, with the current value guaranteed to
 *  be present even if the runtime list does not include it. The server
 *  re-validates the submitted value with Luxon, so this list is convenience
 *  only and never the gate. */
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

export function TimezonePicker({ currentTimezone }: TimezonePickerProps) {
  const [state, formAction, isPending] = useActionState<
    AvailabilityFormState,
    FormData
  >(saveTimezoneAction, {});

  const [timezone, setTimezone] = useState<string>(currentTimezone);
  const zones = supportedTimezones(currentTimezone);
  const selectId = useId();

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label
          htmlFor={selectId}
          className="block text-sm font-medium text-foreground mb-2"
        >
          Timezone
        </label>
        <select
          id={selectId}
          name="timezone"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="w-full rounded-[12px] border-[1.5px] border-border bg-canvas px-4 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary"
        >
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-foreground-muted">
          Availability times are interpreted in this zone.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center rounded-full border-[1.5px] border-primary px-5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-canvas disabled:opacity-50"
        >
          Save timezone
        </button>
        {state.ok ? (
          <span className="text-sm text-foreground-muted">Saved</span>
        ) : null}
        {state.error ? (
          <span className="text-sm text-rose-300">{state.error}</span>
        ) : null}
      </div>
    </form>
  );
}
