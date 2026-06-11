import { Queue } from "bullmq";

import { getSharedConnection } from "./connection";
import { NOTIFICATIONS_QUEUE, QUEUE_PREFIX } from "./constants";

// The producer handle for the notifications queue. Lazily created and memoized
// over the shared Redis connection, consistent with the side-effect-free import
// rule: no queue object is constructed until a caller asks for it. No work is
// enqueued here; later sub-phases add the confirmation and reminder jobs.

let _notificationsQueue: Queue | undefined;

export function getNotificationsQueue(): Queue {
  if (!_notificationsQueue) {
    _notificationsQueue = new Queue(NOTIFICATIONS_QUEUE, {
      connection: getSharedConnection(),
      prefix: QUEUE_PREFIX,
    });
  }
  return _notificationsQueue;
}
