/**
 * Booking status values. Held holds are not rows (they live in Redis from
 * Phase 4b); the table only ever carries `confirmed` and, later, `cancelled`
 * bookings. Status is an app-level varchar (not a pg enum), consistent with
 * the color-as-token decision, so the lifecycle evolves without a migration.
 */
export const BOOKING_STATUSES = ["confirmed", "cancelled"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export const DEFAULT_BOOKING_STATUS: BookingStatus = "confirmed";
