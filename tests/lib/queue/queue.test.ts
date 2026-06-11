import { QueueEvents } from "bullmq";
import { afterAll, describe, expect, it } from "vitest";

import { closeRedis, createRedisConnection } from "@/lib/queue/connection";
import { JOB_NAMES, NOTIFICATIONS_QUEUE, QUEUE_PREFIX } from "@/lib/queue/constants";
import { getNotificationsQueue } from "@/lib/queue/queues";
import { createNotificationsWorker } from "@/lib/queue/worker";

// Proves the substrate round trip end to end against the dev or CI Redis:
// enqueue a `health` job, let the scaffold worker process it, and assert the
// returned result is the payload. The default processor's health branch returns
// the job data, so this also exercises the shipped scaffold, not a stand-in.

describe("notifications queue round trip", () => {
  const queue = getNotificationsQueue();
  // Keep a handle to the QueueEvents connection: BullMQ treats a passed-in
  // ioredis instance as shared and will not quit it on close, so the test owns
  // its teardown.
  const queueEventsConnection = createRedisConnection();
  const queueEvents = new QueueEvents(NOTIFICATIONS_QUEUE, {
    connection: queueEventsConnection,
    prefix: QUEUE_PREFIX,
  });
  const worker = createNotificationsWorker();

  afterAll(async () => {
    await worker.close();
    await queueEvents.close();
    await queue.obliterate({ force: true });
    await queue.close();
    await queueEventsConnection.quit();
    await closeRedis();
  });

  it("processes a health job and returns its payload", async () => {
    await queueEvents.waitUntilReady();

    const payload = { ping: "pong", n: 42 };
    const job = await queue.add(JOB_NAMES.HEALTH, payload);
    const result = await job.waitUntilFinished(queueEvents);

    expect(result).toEqual(payload);
  }, 20_000);
});
