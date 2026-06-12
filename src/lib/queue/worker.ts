import { Worker, type Job, type Processor } from "bullmq";

import { sendConfirmationEmail } from "@/lib/email/send-confirmation";
import { createRedisConnection } from "./connection";
import {
  JOB_NAMES,
  NOTIFICATIONS_QUEUE,
  QUEUE_PREFIX,
  type SendConfirmationJobPayload,
} from "./constants";

// The notifications worker. The `health` job echoes its data so the round-trip
// test can assert a result; `send-confirmation` (Phase 5c) renders and sends
// the branded confirmation email from its self-contained payload, with no
// database read. Send errors throw out of the processor so BullMQ applies the
// retry and backoff configured on the queue; Resend reports API-level failures
// via `result.error` rather than throwing, so that case is raised explicitly
// (an unverified domain or bad sender must fail the job, not complete it).

export const defaultProcessor: Processor = async (job: Job) => {
  if (job.name === JOB_NAMES.HEALTH) {
    return job.data;
  }
  if (job.name === JOB_NAMES.SEND_CONFIRMATION) {
    const result = await sendConfirmationEmail(
      job.data as SendConfirmationJobPayload,
    );
    if (result.error) {
      throw new Error(`confirmation email send failed: ${result.error.message}`);
    }
    return result.data;
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
