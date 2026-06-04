"use client";

import { useActionState, useId, useState } from "react";
import Link from "next/link";
import {
  EVENT_TYPE_COLORS,
  EVENT_TYPE_COLOR_HEX,
  DEFAULT_EVENT_TYPE_COLOR,
  type EventTypeColor,
} from "@/lib/event-types/colors";
import { slugify } from "@/lib/event-types/validation";
import type { EventTypeRow } from "@/lib/db/schema/event-types";
import type { EventTypeFormState } from "./actions";

type FormAction = (
  state: EventTypeFormState,
  formData: FormData,
) => Promise<EventTypeFormState>;

interface EventTypeFormProps {
  action: FormAction;
  submitLabel: string;
  initial?: EventTypeRow;
}

const NUMBER_FIELDS = {
  durationMinutes: { label: "Duration", fallback: "30" },
  bufferBeforeMinutes: { label: "Buffer before", fallback: "0" },
  bufferAfterMinutes: { label: "Buffer after", fallback: "0" },
  slotGranularityMinutes: { label: "Slot granularity", fallback: "15" },
  minNoticeMinutes: { label: "Minimum notice", fallback: "0" },
  maxFutureMinutes: { label: "Maximum future", fallback: "86400" },
} as const;

type NumberField = keyof typeof NUMBER_FIELDS;

export function EventTypeForm({ action, submitLabel, initial }: EventTypeFormProps) {
  const [state, formAction, isPending] = useActionState<
    EventTypeFormState,
    FormData
  >(action, {});

  const errors = state.errors ?? {};
  const values = state.values ?? {};

  // Controlled where behavior depends on it: slug auto-suggests from name
  // until the user edits the slug directly; color and enabled post through
  // a controlled hidden input.
  const [name, setName] = useState<string>(values.name ?? initial?.name ?? "");
  const [slug, setSlug] = useState<string>(values.slug ?? initial?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState<boolean>(
    Boolean(values.slug ?? initial?.slug),
  );
  const [color, setColor] = useState<EventTypeColor>(
    (values.color ?? initial?.color ?? DEFAULT_EVENT_TYPE_COLOR) as EventTypeColor,
  );
  const initialEnabled =
    values.enabled !== undefined
      ? values.enabled === "true"
      : (initial?.enabled ?? true);
  const [enabled, setEnabled] = useState<boolean>(initialEnabled);

  const ids = useFieldIds();

  function onNameChange(next: string) {
    setName(next);
    if (!slugEdited) setSlug(slugify(next));
  }

  function numberDefault(field: NumberField): string {
    const fromValues = values[field];
    if (fromValues !== undefined) return fromValues;
    if (initial) return String(initial[field]);
    return NUMBER_FIELDS[field].fallback;
  }

  return (
    <form action={formAction} className="space-y-8">
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      {errors._form ? (
        <p className="text-sm text-rose-300">{errors._form}</p>
      ) : null}

      <section className="bg-surface rounded-[20px] p-6 space-y-5">
        <Field label="Name" htmlFor={ids.name} error={errors.name}>
          <input
            id={ids.name}
            name="name"
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            className={inputClass}
            autoComplete="off"
          />
        </Field>

        <Field
          label="Slug"
          htmlFor={ids.slug}
          error={errors.slug}
          hint="Lowercase letters, numbers, and hyphens. Unique within your event types."
        >
          <input
            id={ids.slug}
            name="slug"
            type="text"
            value={slug}
            onChange={(e) => {
              setSlugEdited(true);
              setSlug(e.target.value);
            }}
            className={inputClass}
            autoComplete="off"
          />
        </Field>

        <Field
          label="Description"
          htmlFor={ids.description}
          error={errors.description}
        >
          <textarea
            id={ids.description}
            name="description"
            rows={3}
            defaultValue={values.description ?? initial?.description ?? ""}
            className={`${inputClass} resize-y`}
          />
        </Field>
      </section>

      <section className="bg-surface rounded-[20px] p-6 space-y-5">
        <h2 className="text-lg font-medium text-foreground">Duration and buffers</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {(
            [
              "durationMinutes",
              "bufferBeforeMinutes",
              "bufferAfterMinutes",
              "slotGranularityMinutes",
            ] as const
          ).map((field) => (
            <NumberInput
              key={field}
              field={field}
              id={ids[field]}
              defaultValue={numberDefault(field)}
              error={errors[field]}
            />
          ))}
        </div>
      </section>

      <section className="bg-surface rounded-[20px] p-6 space-y-5">
        <h2 className="text-lg font-medium text-foreground">Booking window</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {(["minNoticeMinutes", "maxFutureMinutes"] as const).map((field) => (
            <NumberInput
              key={field}
              field={field}
              id={ids[field]}
              defaultValue={numberDefault(field)}
              error={errors[field]}
            />
          ))}
        </div>
      </section>

      <section className="bg-surface rounded-[20px] p-6 space-y-5">
        <h2 className="text-lg font-medium text-foreground">Appearance</h2>
        <div>
          <span className="block text-sm font-medium text-foreground mb-3">
            Color
          </span>
          <input type="hidden" name="color" value={color} />
          <div className="flex flex-wrap gap-3">
            {EVENT_TYPE_COLORS.map((token) => {
              const selected = token === color;
              return (
                <button
                  key={token}
                  type="button"
                  onClick={() => setColor(token)}
                  aria-pressed={selected}
                  aria-label={token}
                  className={`h-9 w-9 rounded-full border-[1.5px] transition-transform ${
                    selected
                      ? "border-foreground scale-110"
                      : "border-border hover:scale-105"
                  }`}
                  style={{ backgroundColor: EVENT_TYPE_COLOR_HEX[token] }}
                />
              );
            })}
          </div>
        </div>

        <div>
          <span className="block text-sm font-medium text-foreground mb-3">
            Status
          </span>
          <input type="hidden" name="enabled" value={enabled ? "true" : "false"} />
          <button
            type="button"
            onClick={() => setEnabled((v) => !v)}
            aria-pressed={enabled}
            className="inline-flex items-center gap-3 rounded-full border-[1.5px] border-border px-5 py-2 text-sm font-medium text-foreground transition-colors hover:border-foreground-muted"
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                enabled ? "bg-primary" : "bg-foreground-muted"
              }`}
            />
            {enabled ? "Enabled" : "Disabled"}
          </button>
        </div>
      </section>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center rounded-full border-[1.5px] border-primary px-5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary hover:text-canvas disabled:opacity-50"
        >
          {submitLabel}
        </button>
        <Link
          href="/settings/event-types"
          className="text-sm text-foreground-muted transition-colors hover:text-foreground"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

const inputClass =
  "w-full rounded-[12px] border-[1.5px] border-border bg-canvas px-4 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary";

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-foreground mb-2"
      >
        {label}
      </label>
      {children}
      {hint ? (
        <p className="mt-2 text-xs text-foreground-muted">{hint}</p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}

function NumberInput({
  field,
  id,
  defaultValue,
  error,
}: {
  field: NumberField;
  id: string;
  defaultValue: string;
  error?: string;
}) {
  return (
    <Field label={`${NUMBER_FIELDS[field].label} (minutes)`} htmlFor={id} error={error}>
      <input
        id={id}
        name={field}
        type="number"
        min={0}
        defaultValue={defaultValue}
        className={inputClass}
      />
    </Field>
  );
}

function useFieldIds() {
  const base = useId();
  return {
    name: `${base}-name`,
    slug: `${base}-slug`,
    description: `${base}-description`,
    durationMinutes: `${base}-duration`,
    bufferBeforeMinutes: `${base}-buffer-before`,
    bufferAfterMinutes: `${base}-buffer-after`,
    slotGranularityMinutes: `${base}-granularity`,
    minNoticeMinutes: `${base}-min-notice`,
    maxFutureMinutes: `${base}-max-future`,
  };
}
