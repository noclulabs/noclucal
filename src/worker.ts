// Worker process entry. This is the file the `worker` compose service runs
// (via tsx, so `@/` path aliases resolve from tsconfig without a bundling
// step). It boots the notifications worker, logs lifecycle events, and shuts
// down gracefully on SIGTERM / SIGINT so an in-flight job is allowed to finish
// before the process exits.
//
// Phase 5a ships the scaffold only: the worker handles a trivial `health` job
// and otherwise does nothing. Real job processing lands in later sub-phases.

import { closeRedis } from "@/lib/queue/connection";
import { createNotificationsWorker } from "@/lib/queue/worker";

const worker = createNotificationsWorker();

worker.on("ready", () => {
  console.log("notifications worker ready");
});

worker.on("failed", (job, err) => {
  console.error(`notifications worker job ${job?.id ?? "unknown"} failed:`, err);
});

worker.on("error", (err) => {
  console.error("notifications worker error:", err);
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`notifications worker received ${signal}, shutting down`);
  await worker.close();
  await closeRedis();
  console.log("notifications worker shut down cleanly");
  process.exit(0);
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
