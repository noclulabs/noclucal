import { z } from "zod";
import { IANAZone } from "luxon";

/** Wall-clock "HH:MM", 24-hour. The time column round-trips as "HH:MM:SS";
 *  the editor truncates to "HH:MM" on read, and this is the format submitted
 *  back. Zero-padded 24-hour strings sort correctly, so the end-after-start
 *  refine can compare them directly. */
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const availabilityRuleSchema = z
  .object({
    weekday: z.coerce.number().int().min(1).max(7),
    startTime: z.string().regex(TIME_PATTERN, "Use HH:MM"),
    endTime: z.string().regex(TIME_PATTERN, "Use HH:MM"),
  })
  .refine((r) => r.startTime < r.endTime, {
    message: "End must be after start",
    path: ["endTime"],
  });

export const weeklyScheduleSchema = z.object({
  rules: z.array(availabilityRuleSchema),
});

export const timezoneSchema = z
  .string()
  .refine((tz) => IANAZone.isValidZone(tz), "Unknown timezone");

export type AvailabilityRuleInput = z.infer<typeof availabilityRuleSchema>;
export type WeeklyScheduleInput = z.infer<typeof weeklyScheduleSchema>;
