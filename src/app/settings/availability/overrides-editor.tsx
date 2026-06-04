"use client";

import { useActionState, useState } from "react";
import {
  setDateOverrideAction,
  deleteDateOverrideAction,
  type AvailabilityFormState,
} from "./actions";

interface Range {
  startTime: string;
  endTime: string;
}

export interface SeedOverride {
  date: string;
  blocked: boolean;
  ranges: Range[];
}

interface OverridesEditorProps {
  initialOverrides: SeedOverride[];
}

const DEFAULT_RANGE: Range = { startTime: "09:00", endTime: "17:00" };

/** A range is valid only with two well-formed times where end follows start.
 *  Zero-padded "HH:MM" sorts correctly, so a string comparison is enough. */
function rangeInvalid(range: Range): boolean {
  return !range.startTime || !range.endTime || range.endTime <= range.startTime;
}

/** Local calendar date as "YYYY-MM-DD" for the date input's `min`. Runs only
 *  on the client (the form is closed during SSR), so there is no hydration
 *  mismatch. */
function todayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** A stored "YYYY-MM-DD" rendered in a readable form. Parsed as UTC and
 *  formatted in UTC so the day never shifts under the viewer's timezone. */
function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatRanges(ranges: Range[]): string {
  return ranges.map((r) => `${r.startTime} to ${r.endTime}`).join(", ");
}

export function OverridesEditor({ initialOverrides }: OverridesEditorProps) {
  const [setState, setFormAction, setPending] = useActionState<
    AvailabilityFormState,
    FormData
  >(setDateOverrideAction, {});
  const [deleteState, deleteFormAction] = useActionState<
    AvailabilityFormState,
    FormData
  >(deleteDateOverrideAction, {});

  // The inline add/edit form. Null when closed.
  const [draft, setDraft] = useState<SeedOverride | null>(null);

  function openAdd() {
    setDraft({ date: todayIso(), blocked: false, ranges: [{ ...DEFAULT_RANGE }] });
  }

  function openEdit(override: SeedOverride) {
    setDraft({
      date: override.date,
      blocked: override.blocked,
      ranges: override.ranges.map((range) => ({ ...range })),
    });
  }

  function setBlocked(blocked: boolean) {
    setDraft((prev) => {
      if (!prev) return prev;
      if (blocked) return { ...prev, blocked: true };
      // Switching to custom hours needs at least one range to fill in.
      const ranges = prev.ranges.length > 0 ? prev.ranges : [{ ...DEFAULT_RANGE }];
      return { ...prev, blocked: false, ranges };
    });
  }

  function addRange() {
    setDraft((prev) =>
      prev ? { ...prev, ranges: [...prev.ranges, { ...DEFAULT_RANGE }] } : prev,
    );
  }

  function removeRange(index: number) {
    setDraft((prev) =>
      prev
        ? { ...prev, ranges: prev.ranges.filter((_, i) => i !== index) }
        : prev,
    );
  }

  function updateRange(index: number, field: keyof Range, value: string) {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            ranges: prev.ranges.map((range, i) =>
              i === index ? { ...range, [field]: value } : range,
            ),
          }
        : prev,
    );
  }

  const payload: SeedOverride | null = draft
    ? draft.blocked
      ? { date: draft.date, blocked: true, ranges: [] }
      : { date: draft.date, blocked: false, ranges: draft.ranges }
    : null;

  const draftInvalid =
    !draft ||
    !draft.date ||
    (!draft.blocked &&
      (draft.ranges.length === 0 || draft.ranges.some(rangeInvalid)));

  return (
    <div className="space-y-5">
      {initialOverrides.length === 0 ? (
        <p className="text-sm text-foreground-muted">No date overrides yet.</p>
      ) : (
        <div className="space-y-2">
          {initialOverrides.map((override) => (
            <div
              key={override.date}
              className="flex items-center justify-between gap-4 rounded-[12px] border-[1.5px] border-border p-4"
            >
              <div>
                <p className="text-sm font-medium text-foreground">
                  {formatDate(override.date)}
                </p>
                <p className="text-xs text-foreground-muted">
                  {override.blocked
                    ? "Unavailable"
                    : formatRanges(override.ranges)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(override)}
                  className="text-xs font-medium text-primary transition-colors hover:text-foreground"
                >
                  Edit
                </button>
                <form action={deleteFormAction}>
                  <input type="hidden" name="date" value={override.date} />
                  <button
                    type="submit"
                    aria-label={`Remove override for ${override.date}`}
                    className="inline-flex items-center rounded-full border-[1.5px] border-border px-3 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:border-foreground-muted hover:text-foreground"
                  >
                    Remove
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteState.error ? (
        <span className="text-sm text-rose-300">{deleteState.error}</span>
      ) : null}

      {draft ? (
        <form
          action={setFormAction}
          className="space-y-4 rounded-[12px] border-[1.5px] border-border p-4"
        >
          <input
            type="hidden"
            name="override"
            value={JSON.stringify(payload)}
          />

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Date
            </label>
            <input
              type="date"
              name="draft-date"
              min={todayIso()}
              value={draft.date}
              onChange={(e) =>
                setDraft((prev) =>
                  prev ? { ...prev, date: e.target.value } : prev,
                )
              }
              className="rounded-[12px] border-[1.5px] border-border bg-canvas px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary"
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-foreground mb-1">
              Availability
            </legend>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="radio"
                name="draft-mode"
                checked={draft.blocked}
                onChange={() => setBlocked(true)}
              />
              Block this day
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="radio"
                name="draft-mode"
                checked={!draft.blocked}
                onChange={() => setBlocked(false)}
              />
              Custom hours
            </label>
          </fieldset>

          {!draft.blocked ? (
            <div className="space-y-2">
              {draft.ranges.map((range, index) => {
                const invalid = rangeInvalid(range);
                return (
                  <div key={index} className="flex items-center gap-3">
                    <input
                      type="time"
                      aria-label="Override start time"
                      value={range.startTime}
                      onChange={(e) =>
                        updateRange(index, "startTime", e.target.value)
                      }
                      className={timeInputClass(invalid)}
                    />
                    <span className="text-xs text-foreground-muted">to</span>
                    <input
                      type="time"
                      aria-label="Override end time"
                      value={range.endTime}
                      onChange={(e) =>
                        updateRange(index, "endTime", e.target.value)
                      }
                      className={timeInputClass(invalid)}
                    />
                    <button
                      type="button"
                      onClick={() => removeRange(index)}
                      aria-label="Remove range"
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
              <button
                type="button"
                onClick={addRange}
                className="text-xs font-medium text-primary transition-colors hover:text-foreground"
              >
                Add range
              </button>
            </div>
          ) : null}

          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={setPending || draftInvalid}
              className="inline-flex items-center rounded-full border-[1.5px] border-primary px-5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-canvas disabled:opacity-50"
            >
              Save override
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="text-sm font-medium text-foreground-muted transition-colors hover:text-foreground"
            >
              Cancel
            </button>
            {setState.ok ? (
              <span className="text-sm text-foreground-muted">Saved</span>
            ) : null}
            {setState.error ? (
              <span className="text-sm text-rose-300">{setState.error}</span>
            ) : null}
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={openAdd}
          className="inline-flex items-center rounded-full border-[1.5px] border-primary px-5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-canvas"
        >
          Add override
        </button>
      )}
    </div>
  );
}

function timeInputClass(invalid: boolean): string {
  return `rounded-[12px] border-[1.5px] bg-canvas px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary ${
    invalid ? "border-rose-300" : "border-border"
  }`;
}
