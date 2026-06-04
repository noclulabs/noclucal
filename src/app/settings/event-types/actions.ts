"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ZodError } from "zod";
import { auth } from "@/auth";
import { eventTypeInputSchema } from "@/lib/event-types/validation";
import {
  createEventType,
  updateEventType,
  deleteEventType,
  SlugConflictError,
} from "@/lib/event-types/queries";

export interface EventTypeFormState {
  errors?: Record<string, string>;
  values?: Record<string, string>;
}

const LIST_PATH = "/settings/event-types";

/** Pull the raw event-type fields off the submitted form. The enabled
 *  checkbox posts the literal string "true" or "false"; read it explicitly
 *  rather than coercing a raw checkbox value. */
function readForm(formData: FormData) {
  return {
    name: formData.get("name"),
    slug: formData.get("slug"),
    description: (formData.get("description") as string) || null,
    durationMinutes: formData.get("durationMinutes"),
    bufferBeforeMinutes: formData.get("bufferBeforeMinutes"),
    bufferAfterMinutes: formData.get("bufferAfterMinutes"),
    minNoticeMinutes: formData.get("minNoticeMinutes"),
    maxFutureMinutes: formData.get("maxFutureMinutes"),
    slotGranularityMinutes: formData.get("slotGranularityMinutes"),
    color: formData.get("color"),
    enabled: formData.get("enabled") === "true",
  };
}

/** First Zod issue per field path, as a flat { field: message } record. */
function flattenFieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? String(issue.path[0]) : "_form";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

/** Stringify the raw form values so the client form can repopulate after a
 *  validation error without losing what the user typed. */
function asStrings(raw: ReturnType<typeof readForm>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === null || value === undefined) {
      out[key] = "";
    } else if (typeof value === "boolean") {
      out[key] = value ? "true" : "false";
    } else {
      out[key] = String(value);
    }
  }
  return out;
}

export async function createEventTypeAction(
  _prev: EventTypeFormState,
  formData: FormData,
): Promise<EventTypeFormState> {
  const session = await auth();
  if (!session?.user?.id) redirect(LIST_PATH);

  const raw = readForm(formData);
  const parsed = eventTypeInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: flattenFieldErrors(parsed.error), values: asStrings(raw) };
  }

  try {
    await createEventType(session.user.id, parsed.data);
  } catch (err) {
    if (err instanceof SlugConflictError) {
      return { errors: { slug: err.message }, values: asStrings(raw) };
    }
    throw err;
  }

  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
}

export async function updateEventTypeAction(
  _prev: EventTypeFormState,
  formData: FormData,
): Promise<EventTypeFormState> {
  const session = await auth();
  if (!session?.user?.id) redirect(LIST_PATH);

  const id = formData.get("id");
  if (typeof id !== "string" || id.length === 0) redirect(LIST_PATH);

  const raw = readForm(formData);
  const parsed = eventTypeInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: flattenFieldErrors(parsed.error), values: asStrings(raw) };
  }

  try {
    const updated = await updateEventType(
      { userId: session.user.id, id },
      parsed.data,
    );
    if (!updated) redirect(LIST_PATH);
  } catch (err) {
    if (err instanceof SlugConflictError) {
      return { errors: { slug: err.message }, values: asStrings(raw) };
    }
    throw err;
  }

  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
}

export async function deleteEventTypeAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) redirect(LIST_PATH);

  const id = formData.get("id");
  if (typeof id === "string" && id.length > 0) {
    await deleteEventType({ userId: session.user.id, id });
  }

  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
}
