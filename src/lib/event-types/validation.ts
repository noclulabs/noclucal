import { z } from "zod";
import {
  EVENT_TYPE_COLORS,
  DEFAULT_EVENT_TYPE_COLOR,
} from "@/lib/event-types/colors";

/** Slugs the app reserves for its own routing under /settings/event-types. */
export const RESERVED_SLUGS = ["new", "edit", "api"] as const;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Derive a candidate slug from a display name. The form suggests this; the
 *  user can override it. The schema validates whatever is finally submitted. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const eventTypeInputSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(200),
    slug: z
      .string()
      .trim()
      .min(1, "Slug is required")
      .max(200)
      .regex(SLUG_PATTERN, "Use lowercase letters, numbers, and hyphens")
      .refine(
        (s) => !RESERVED_SLUGS.includes(s as (typeof RESERVED_SLUGS)[number]),
        "That slug is reserved",
      ),
    description: z.string().trim().max(2000).nullable().optional(),
    durationMinutes: z.coerce.number().int().positive().max(1440),
    bufferBeforeMinutes: z.coerce.number().int().min(0).max(1440).default(0),
    bufferAfterMinutes: z.coerce.number().int().min(0).max(1440).default(0),
    minNoticeMinutes: z.coerce.number().int().min(0).default(0),
    maxFutureMinutes: z.coerce.number().int().positive().default(86400),
    slotGranularityMinutes: z.coerce.number().int().positive().max(1440).default(15),
    color: z.enum(EVENT_TYPE_COLORS).default(DEFAULT_EVENT_TYPE_COLOR),
    enabled: z.boolean().default(true),
  })
  .refine((v) => v.minNoticeMinutes < v.maxFutureMinutes, {
    message: "Minimum notice must be less than how far ahead bookings are allowed",
    path: ["minNoticeMinutes"],
  });

export type EventTypeInput = z.infer<typeof eventTypeInputSchema>;
