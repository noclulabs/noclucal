import { afterEach, describe, expect, it } from "vitest";

import { createRedisConnection, requireRedisUrl } from "@/lib/queue/connection";

describe("queue connection", () => {
  let savedRedisUrl: string | undefined;

  afterEach(() => {
    if (savedRedisUrl !== undefined) {
      process.env.REDIS_URL = savedRedisUrl;
      savedRedisUrl = undefined;
    }
  });

  describe("requireRedisUrl", () => {
    it("throws when REDIS_URL is unset", () => {
      savedRedisUrl = process.env.REDIS_URL;
      delete process.env.REDIS_URL;
      expect(() => requireRedisUrl()).toThrow("REDIS_URL is not set");
    });

    it("throws when REDIS_URL is an empty string", () => {
      savedRedisUrl = process.env.REDIS_URL;
      process.env.REDIS_URL = "";
      expect(() => requireRedisUrl()).toThrow("REDIS_URL is not set");
    });

    it("returns the value when REDIS_URL is set", () => {
      savedRedisUrl = process.env.REDIS_URL;
      process.env.REDIS_URL = "redis://example:6379";
      expect(requireRedisUrl()).toBe("redis://example:6379");
    });
  });

  describe("createRedisConnection", () => {
    it("answers PING against the dev or CI Redis", async () => {
      const redis = createRedisConnection();
      try {
        await expect(redis.ping()).resolves.toBe("PONG");
      } finally {
        await redis.quit();
      }
    });
  });
});
