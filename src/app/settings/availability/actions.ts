"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  weeklyScheduleSchema,
  timezoneSchema,
} from "@/lib/availability/validation";
import {
  replaceAvailabilityRulesForUser,
  upsertHostTimezone,
} from "@/lib/availability/queries";

export interface AvailabilityFormState {
  ok?: boolean;
  error?: string;
}

const SETTINGS_PATH = "/settings/availability";

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
