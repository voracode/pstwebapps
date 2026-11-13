import Redis from "ioredis";
import { env } from "@/env";

const globalForRedis = globalThis as unknown as { redis?: Redis };

function createRedis(): Redis {
  const e = env();
  const client = new Redis(e.REDIS_URL, {
    keyPrefix: e.REDIS_KEY_PREFIX,
    maxRetriesPerRequest: 2,
    enableAutoPipelining: true,
    lazyConnect: false,
  });
  client.on("error", (err) => console.error("[redis]", err.message));
  return client;
}

/** Shared Redis client (keys are automatically prefixed with REDIS_KEY_PREFIX). */
export function redis(): Redis {
  if (!globalForRedis.redis) globalForRedis.redis = createRedis();
  return globalForRedis.redis;
}

/**
 * Blocking commands (BRPOP) hold the connection, so the worker gets its own
 * client instead of the shared one.
 */
export function createBlockingRedis(): Redis {
  return createRedis();
}
