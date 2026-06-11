import { Worker, type Job, type Processor } from "bullmq";

import { createRedisConnection } from "./connection";
import { JOB_NAMES, NOTIFICATIONS_QUEUE, QUEUE_PREFIX } from "./constants";

// The notifications worker scaffold. Phase 5a ships no real job logic: the
// default processor only handles the trivial `health` job (echoing its data so
// the round-trip test can assert a result) and otherwise resolves with no side
// effect. Confirmation and reminder processing land in later sub-phases.

export const defaultProcessor: Processor = async (job: Job) => {
  if (job.name === JOB_NAMES.HEALTH) {
    return job.data;
  }
  return undefined;
};

// Build a worker over the notifications queue. The worker gets its own fresh
// Redis connection (not the shared producer connection), because its blocking
// commands monopolize a connection. A processor can be injected for tests; the
// default is the no-op scaffold above.
export function createNotificationsWorker(processor: Processor = defaultProcessor): Worker {
  return new Worker(NOTIFICATIONS_QUEUE, processor, {
    connection: createRedisConnection(),
    prefix: QUEUE_PREFIX,
  });
}
