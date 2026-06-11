// scripts/redis-smoke-test.ts
// Permanent diagnostic tool: confirm the Redis connection works. The Redis
// analogue of scripts/db-smoke-test.ts. Runs PING and a SET / GET / DEL round
// trip on a throwaway key against the configured REDIS_URL. Useful for quickly
// answering "is Redis reachable right now?" without depending on any queue.
//
// Usage: pnpm redis:smoke

import { createRedisConnection } from "../src/lib/queue/connection";

async function main() {
  console.log("Testing Redis connection...");

  const redis = createRedisConnection();
  try {
    const pong = await redis.ping();
    console.log(`PING => ${pong}`);

    const key = "noclucal:smoke";
    const setResult = await redis.set(key, "ok");
    console.log(`SET ${key} => ${setResult}`);

    const getResult = await redis.get(key);
    console.log(`GET ${key} => ${getResult}`);

    const delResult = await redis.del(key);
    console.log(`DEL ${key} => ${delResult}`);

    console.log("Redis smoke test passed.");
  } finally {
    await redis.quit();
  }
}

main().catch((err) => {
  console.error("Redis smoke test failed:", err);
  process.exit(1);
});
