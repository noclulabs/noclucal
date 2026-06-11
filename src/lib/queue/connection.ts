import IORedis, { type RedisOptions } from "ioredis";

// Redis connection management for BullMQ, mirroring the lazy, side-effect-free
// shape of src/lib/db/index.ts. Importing this module has zero side effects:
// no connection opens until a function here is called, and a missing REDIS_URL
// throws only at first use, never at import time. This is load-bearing because
// Next.js's build-time module collection imports route modules transitively
// without REDIS_URL set, and an eager connect would crash the build.

// BullMQ requires maxRetriesPerRequest to be null on any connection a Worker
// uses, because Workers issue blocking commands (BRPOPLPUSH and friends) that
// must not be aborted by the retry limiter. We apply it to every connection so
// the producer and worker sides share one option set.
const REDIS_OPTIONS: RedisOptions = { maxRetriesPerRequest: null };

let _shared: IORedis | undefined;

export function requireRedisUrl(): string {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is not set");
  }
  return url;
}

// A fresh connection on every call. The Worker takes its own connection here,
// because its blocking commands monopolize a connection and must not share the
// memoized producer connection.
export function createRedisConnection(): IORedis {
  return new IORedis(requireRedisUrl(), REDIS_OPTIONS);
}

// The memoized connection for the producer / queue side. Reused across enqueue
// calls so we do not open a socket per job.
export function getSharedConnection(): IORedis {
  if (!_shared) {
    _shared = new IORedis(requireRedisUrl(), REDIS_OPTIONS);
  }
  return _shared;
}

export async function closeRedis(): Promise<void> {
  if (_shared) {
    const conn = _shared;
    _shared = undefined;
    await conn.quit();
  }
}
