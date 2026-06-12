// Queue naming constants for BullMQ. The prefix namespaces every key under
// `noclucal` so the keyspace stays isolated even if Redis is ever shared with
// another suite app later.

export const QUEUE_PREFIX = "noclucal";

export const NOTIFICATIONS_QUEUE = "notifications";

// Job names handled on the notifications queue. `health` proves the
// enqueue-to-process round trip in tests; `send-confirmation` carries the
// branded booking-confirmation email (Phase 5c). Reminder jobs land in 5d.
export const JOB_NAMES = {
  HEALTH: "health",
  SEND_CONFIRMATION: "send-confirmation",
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

// The send-confirmation job payload is exactly the input of
// `sendConfirmationEmail`: the enqueuer builds it from data it already holds
// and the worker passes `job.data` straight through, with no database read.
// Re-exported (type-only, so this module stays side-effect-free) rather than
// duplicated, so the job payload and the send input cannot drift apart.
export type { SendConfirmationEmailInput as SendConfirmationJobPayload } from "@/lib/email/send-confirmation";
