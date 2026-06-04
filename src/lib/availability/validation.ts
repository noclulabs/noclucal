import { z } from "zod";
import { IANAZone, DateTime } from "luxon";

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

/** Calendar date "YYYY-MM-DD". The regex gates the shape; the refine rejects
 *  an impossible date (for example 2026-13-40) that still matches the shape. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A date-specific override. A date is either blocked (no hours, `blocked`
 * true with an empty `ranges`) or has custom hours that replace the weekly
 * rules for that date (`blocked` false with at least one range). The final
 * refine keeps the two modes mutually exclusive, so the rows the data-access
 * produces always satisfy the availability_overrides shape CHECK.
 */
export const dateOverrideInputSchema = z
  .object({
    date: z
      .string()
      .regex(DATE_PATTERN, "Use YYYY-MM-DD")
      .refine((d) => DateTime.fromISO(d).isValid, "Not a real date"),
    blocked: z.boolean(),
    ranges: z.array(
      z
        .object({
          startTime: z.string().regex(TIME_PATTERN, "Use HH:MM"),
          endTime: z.string().regex(TIME_PATTERN, "Use HH:MM"),
        })
        .refine((r) => r.startTime < r.endTime, {
          message: "End must be after start",
          path: ["endTime"],
        }),
    ),
  })
  .refine((o) => (o.blocked ? o.ranges.length === 0 : o.ranges.length > 0), {
    message:
      "A blocked day has no hours; an available day needs at least one range",
    path: ["ranges"],
  });

export type DateOverrideInput = z.infer<typeof dateOverrideInputSchema>;
