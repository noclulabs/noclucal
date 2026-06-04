"use client";

import { useActionState, useMemo, useState } from "react";
import {
  saveWeeklyScheduleAction,
  type AvailabilityFormState,
} from "./actions";

interface Range {
  startTime: string;
  endTime: string;
}

export interface SeedRule {
  weekday: number;
  startTime: string;
  endTime: string;
}

interface AvailabilityEditorProps {
  initialRules: SeedRule[];
}

type WeekState = Record<number, Range[]>;

const WEEKDAYS: { weekday: number; label: string }[] = [
  { weekday: 1, label: "Monday" },
  { weekday: 2, label: "Tuesday" },
  { weekday: 3, label: "Wednesday" },
  { weekday: 4, label: "Thursday" },
  { weekday: 5, label: "Friday" },
  { weekday: 6, label: "Saturday" },
  { weekday: 7, label: "Sunday" },
];

const DEFAULT_RANGE: Range = { startTime: "09:00", endTime: "17:00" };

function seedWeek(rules: SeedRule[]): WeekState {
  const week: WeekState = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
  for (const rule of rules) {
    if (week[rule.weekday]) {
      week[rule.weekday].push({
        startTime: rule.startTime,
        endTime: rule.endTime,
      });
    }
  }
  return week;
}

/** A range is valid only with two well-formed times where end follows start.
 *  Zero-padded "HH:MM" sorts correctly, so a string comparison is enough. */
function rangeInvalid(range: Range): boolean {
  return (
    !range.startTime || !range.endTime || range.endTime <= range.startTime
  );
}

export function AvailabilityEditor({ initialRules }: AvailabilityEditorProps) {
  const [state, formAction, isPending] = useActionState<
    AvailabilityFormState,
    FormData
  >(saveWeeklyScheduleAction, {});

  const [week, setWeek] = useState<WeekState>(() => seedWeek(initialRules));

  const flattened = useMemo(
    () =>
      WEEKDAYS.flatMap(({ weekday }) =>
        week[weekday].map((range) => ({
          weekday,
          startTime: range.startTime,
          endTime: range.endTime,
        })),
      ),
    [week],
  );

  const hasInvalid = useMemo(
    () => WEEKDAYS.some(({ weekday }) => week[weekday].some(rangeInvalid)),
    [week],
  );

  function addRange(weekday: number) {
    setWeek((prev) => ({
      ...prev,
      [weekday]: [...prev[weekday], { ...DEFAULT_RANGE }],
    }));
  }

  function removeRange(weekday: number, index: number) {
    setWeek((prev) => ({
      ...prev,
      [weekday]: prev[weekday].filter((_, i) => i !== index),
    }));
  }

  function updateRange(
    weekday: number,
    index: number,
    field: keyof Range,
    value: string,
  ) {
    setWeek((prev) => ({
      ...prev,
      [weekday]: prev[weekday].map((range, i) =>
        i === index ? { ...range, [field]: value } : range,
      ),
    }));
  }

  function copyToAllDays(weekday: number) {
    setWeek((prev) => {
      const source = prev[weekday].map((range) => ({ ...range }));
      const next: WeekState = { ...prev };
      for (const { weekday: target } of WEEKDAYS) {
        next[target] = source.map((range) => ({ ...range }));
      }
      return next;
    });
  }

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="schedule" value={JSON.stringify(flattened)} />

      <div className="space-y-4">
        {WEEKDAYS.map(({ weekday, label }) => {
          const ranges = week[weekday];
          return (
            <div
              key={weekday}
              className="rounded-[12px] border-[1.5px] border-border p-4"
            >
              <div className="flex items-center justify-between gap-4 mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-foreground">
                    {label}
                  </span>
                  {ranges.length === 0 ? (
                    <span className="text-xs text-foreground-muted">
                      Unavailable
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  {ranges.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => copyToAllDays(weekday)}
                      className="text-xs font-medium text-foreground-muted transition-colors hover:text-foreground"
                    >
                      Copy to all days
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => addRange(weekday)}
                    className="text-xs font-medium text-primary transition-colors hover:text-foreground"
                  >
                    Add range
                  </button>
                </div>
              </div>

              {ranges.length > 0 ? (
                <div className="space-y-2">
                  {ranges.map((range, index) => {
                    const invalid = rangeInvalid(range);
                    return (
                      <div key={index} className="flex items-center gap-3">
                        <input
                          type="time"
                          aria-label={`${label} start time`}
                          value={range.startTime}
                          onChange={(e) =>
                            updateRange(weekday, index, "startTime", e.target.value)
                          }
                          className={timeInputClass(invalid)}
                        />
                        <span className="text-xs text-foreground-muted">to</span>
                        <input
                          type="time"
                          aria-label={`${label} end time`}
                          value={range.endTime}
                          onChange={(e) =>
                            updateRange(weekday, index, "endTime", e.target.value)
                          }
                          className={timeInputClass(invalid)}
                        />
                        <button
                          type="button"
                          onClick={() => removeRange(weekday, index)}
                          aria-label={`Remove ${label} range`}
                          className="inline-flex items-center rounded-full border-[1.5px] border-border px-3 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:border-foreground-muted hover:text-foreground"
                        >
                          Remove
                        </button>
                        {invalid ? (
                          <span className="text-xs text-rose-300">
                            End must be after start
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={isPending || hasInvalid}
          className="inline-flex items-center rounded-full border-[1.5px] border-primary px-5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-canvas disabled:opacity-50"
        >
          Save schedule
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

function timeInputClass(invalid: boolean): string {
  return `rounded-[12px] border-[1.5px] bg-canvas px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary ${
    invalid ? "border-rose-300" : "border-border"
  }`;
}
