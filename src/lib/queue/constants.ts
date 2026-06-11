// Queue naming constants for BullMQ. The prefix namespaces every key under
// `noclucal` so the keyspace stays isolated even if Redis is ever shared with
// another suite app later.

export const QUEUE_PREFIX = "noclucal";

export const NOTIFICATIONS_QUEUE = "notifications";

// Job names handled on the notifications queue. Phase 5a ships only the
// trivial `health` job, used to prove the enqueue-to-process round trip in
// tests. Real job names (confirmation, reminder) land in later sub-phases.
export const JOB_NAMES = {
  HEALTH: "health",
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];
