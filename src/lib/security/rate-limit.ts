import { randomBytes } from "node:crypto";
import { redis } from "@/lib/redis";

/**
 * Sliding-window rate limiter backed by a Redis sorted set (atomic Lua).
 * Each hit is a member scored by its timestamp; hits older than the window
 * are trimmed before counting.
 */
const SCRIPT = `
local key    = KEYS[1]
local now    = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit  = tonumber(ARGV[3])
local member = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
if count < limit then
  redis.call('ZADD', key, now, member)
  redis.call('PEXPIRE', key, window)
  return {1, limit - count - 1, 0}
end
local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
local retry = window
if oldest[2] then retry = tonumber(oldest[2]) + window - now end
return {0, 0, retry}
`;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

export interface RateLimitOptions {
  /** Max hits within the window. */
  limit: number;
  /** Window length in seconds. */
  windowSec: number;
  /**
   * When Redis is unavailable: `false` (default) lets the request through so
   * public pages keep working; `true` rejects (use for login / OTP).
   */
  failClosed?: boolean;
}

export async function rateLimit(bucket: string, id: string, opts: RateLimitOptions): Promise<RateLimitResult> {
  const key = `rl:${bucket}:${id}`;
  const now = Date.now();
  try {
    const [allowed, remaining, retryMs] = (await redis().eval(
      SCRIPT,
      1,
      key,
      now,
      opts.windowSec * 1000,
      opts.limit,
      `${now}-${randomBytes(4).toString("hex")}`,
    )) as [number, number, number];
    return { allowed: allowed === 1, remaining, retryAfterSec: Math.ceil(retryMs / 1000) };
  } catch (err) {
    console.error("[rate-limit] redis unavailable:", (err as Error).message);
    return opts.failClosed
      ? { allowed: false, remaining: 0, retryAfterSec: 60 }
      : { allowed: true, remaining: opts.limit, retryAfterSec: 0 };
  }
}

export async function resetRateLimit(bucket: string, id: string): Promise<void> {
  try {
    await redis().del(`rl:${bucket}:${id}`);
  } catch {
    /* best effort */
  }
}
