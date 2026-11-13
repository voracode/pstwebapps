/**
 * PST background worker — runs as its own container (same image as the app):
 *
 *   node --import tsx src/worker/index.ts      (or: npm run worker)
 *
 * Jobs
 *   • notification consumer   BRPOP on the Redis queue → Telegram / SMTP
 *   • outbox sweeper          every 30 s  (retries, lost pushes, crashed sends)
 *   • scheduled publishing    every 60 s
 *   • view-counter flush      every 5 min (Redis → post_views_daily)
 *   • health watchdog         every 5 min (Telegram alert on state change)
 *   • session purge           every 6 h
 */
import "dotenv/config";
import { env } from "@/env";
import { db } from "@/lib/db";
import { createBlockingRedis, redis } from "@/lib/redis";
import { alertAdmins, QUEUE_KEY } from "@/lib/notify";
import { deliver, sweepOutbox } from "@/lib/notify/deliver";
import { purgeOldSessions } from "@/lib/security/session";
import { flushPostViews, publishDueScheduledPosts } from "@/server/services/post.service";
import { systemHealth } from "@/server/services/dashboard.service";

let running = true;
const timers: NodeJS.Timeout[] = [];

const log = (msg: string, extra?: unknown) =>
  console.log(`${new Date().toISOString()} [worker] ${msg}`, extra === undefined ? "" : extra);

function every(name: string, ms: number, job: () => Promise<unknown>, runNow = false) {
  let busy = false;
  const tick = async () => {
    if (busy || !running) return;
    busy = true;
    try {
      const result = await job();
      if (typeof result === "number" && result > 0) log(`${name}: ${result}`);
    } catch (err) {
      console.error(`[worker] ${name} failed:`, err);
    } finally {
      busy = false;
    }
  };
  timers.push(setInterval(tick, ms));
  if (runNow) void tick();
}

async function consume() {
  const blocking = createBlockingRedis();
  // keyPrefix is applied by ioredis to BRPOP keys as well.
  while (running) {
    try {
      const res = await blocking.brpop(QUEUE_KEY, 5);
      if (!res) continue;
      const outcome = await deliver(res[1]);
      if (outcome !== "skipped") log(`notification ${res[1]} → ${outcome}`);
    } catch (err) {
      if (!running) break;
      console.error("[worker] consumer error:", (err as Error).message);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  blocking.disconnect();
}

let lastHealth: string | undefined;
async function watchdog() {
  const h = await systemHealth();
  if (lastHealth !== undefined && h.status !== lastHealth) {
    await alertAdmins("system", "system.health", {
      status: h.status,
      details: Object.entries(h.checks)
        .map(([k, c]) => `${c.ok ? "OK " : "ERR"} ${k}${c.detail ? `: ${c.detail}` : ""}`)
        .join("\n"),
    });
  }
  lastHealth = h.status;
}

async function shutdown(signal: string) {
  if (!running) return;
  running = false;
  log(`${signal} received, shutting down`);
  timers.forEach(clearInterval);
  // Let an in-flight BRPOP (max 5 s) and delivery finish.
  await new Promise((r) => setTimeout(r, 6000));
  await db.$disconnect();
  redis().disconnect();
  process.exit(0);
}

async function main() {
  env(); // fail fast on bad configuration
  await db.$queryRaw`SELECT 1`;
  await redis().ping();
  log("started");

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  every("outbox-sweep", 30_000, sweepOutbox, true);
  every("scheduled-posts", 60_000, publishDueScheduledPosts, true);
  every("view-flush", 5 * 60_000, flushPostViews);
  every("health-watchdog", 5 * 60_000, watchdog, true);
  every("session-purge", 6 * 3_600_000, purgeOldSessions, true);

  await alertAdmins("system", "system.notice", { message: "Worker started ✅" });
  await consume();
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
