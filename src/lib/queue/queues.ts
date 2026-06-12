import { Queue } from "bullmq";

import { getSharedConnection } from "./connection";
import { NOTIFICATIONS_QUEUE, QUEUE_PREFIX } from "./constants";

// The producer handle for the notifications queue. Lazily created and memoized
// over the shared Redis connection, consistent with the side-effect-free import
// rule: no queue object is constructed until a caller asks for it.
//
// Default job options (Phase 5c): transient send failures retry three times
// with exponential backoff; completed jobs are removed immediately because
// their payloads carry invitee PII and must not linger in Redis; failed jobs
// keep a small bounded window for debugging, so memory stays bounded under the
// noeviction policy.

let _notificationsQueue: Queue | undefined;

export function getNotificationsQueue(): Queue {
  if (!_notificationsQueue) {
    _notificationsQueue = new Queue(NOTIFICATIONS_QUEUE, {
      connection: getSharedConnection(),
      prefix: QUEUE_PREFIX,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    });
  }
  return _notificationsQueue;
}
