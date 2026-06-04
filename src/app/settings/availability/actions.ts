"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  weeklyScheduleSchema,
  timezoneSchema,
  dateOverrideInputSchema,
} from "@/lib/availability/validation";
import {
  replaceAvailabilityRulesForUser,
  upsertHostTimezone,
  setDateOverrideForUser,
  deleteDateOverrideForUser,
} from "@/lib/availability/queries";

export interface AvailabilityFormState {
  ok?: boolean;
  error?: string;
}

const SETTINGS_PATH = "/settings/availability";

/** Calendar date "YYYY-MM-DD"; gates the delete action's date field. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Save the whole weekly schedule. The editor posts every weekday's ranges
 * as one JSON string in the `schedule` field; we parse it, re-validate with
 * the same Zod schema the client uses, and replace the user's rules
 * transactionally. An empty schedule clears all rules.
 */
export async function saveWeeklyScheduleAction(
  _prev: AvailabilityFormState,
  formData: FormData,
): Promise<AvailabilityFormState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Your session expired. Reload the page and try again." };
  }

  let raw: unknown;
  try {
    raw = JSON.parse((formData.get("schedule") as string) ?? "null");
  } catch {
    return { error: "Could not read the schedule. Try again." };
  }

  const parsed = weeklyScheduleSchema.safeParse({ rules: raw });
  if (!parsed.success) {
    return {
      error: "Some ranges are invalid. Check that each end time is after its start.",
    };
  }

  await replaceAvailabilityRulesForUser(session.user.id, parsed.data.rules);
  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/**
 * Save the host timezone. The picker is populated client-side from
 * `Intl.supportedValuesOf`, but the value is re-validated here against
 * Luxon's `IANAZone.isValidZone` before it is upserted.
 */
export async function saveTimezoneAction(
  _prev: AvailabilityFormState,
  formData: FormData,
): Promise<AvailabilityFormState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Your session expired. Reload the page and try again." };
  }

  const parsed = timezoneSchema.safeParse(formData.get("timezone"));
  if (!parsed.success) {
    return { error: "That timezone is not recognized." };
  }

  await upsertHostTimezone(session.user.id, parsed.data);
  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/**
 * Save a single date override. The editor posts the date, its blocked flag,
 * and its ranges as one JSON string in the `override` field; we parse it,
 * re-validate with the same Zod schema the client uses, and replace the
 * user's rows for that date transactionally.
 */
export async function setDateOverrideAction(
  _prev: AvailabilityFormState,
  formData: FormData,
): Promise<AvailabilityFormState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Your session expired. Reload the page and try again." };
  }

  let raw: unknown;
  try {
    raw = JSON.parse((formData.get("override") as string) ?? "null");
  } catch {
    return { error: "Could not read the override. Try again." };
  }

  const parsed = dateOverrideInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: "That override is invalid. Check the date and each time range.",
    };
  }

  await setDateOverrideForUser(session.user.id, parsed.data);
  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/**
 * Remove a single date override. The editor posts the date in the `date`
 * field; we format-check it and delete every row the user has for that date.
 */
export async function deleteDateOverrideAction(
  _prev: AvailabilityFormState,
  formData: FormData,
): Promise<AvailabilityFormState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Your session expired. Reload the page and try again." };
  }

  const date = formData.get("date");
  if (typeof date !== "string" || !DATE_PATTERN.test(date)) {
    return { error: "Could not read the date. Try again." };
  }

  await deleteDateOverrideForUser(session.user.id, date);
  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}
