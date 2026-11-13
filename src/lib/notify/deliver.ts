import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { renderEmail, renderTelegram, type TemplateName } from "./templates";
import { DeliveryError, telegramSend } from "./telegram";
import { sendMail } from "./mailer";
import { QUEUE_KEY } from "./index";

export const MAX_ATTEMPTS = 6;

/** Exponential backoff: 30 s, 1 min, 2 min, 4 min, 8 min… */
const backoffMs = (attempt: number) => Math.min(30_000 * 2 ** (attempt - 1), 60 * 60_000);

/**
 * Delivers one outbox row. Claiming is a conditional UPDATE, so several
 * worker replicas (or a sweeper re-queue racing a consumer) never send twice.
 */
export async function deliver(id: string): Promise<"sent" | "failed" | "skipped"> {
  const claimed = await db.notificationOutbox.updateMany({
    where: { id, status: { in: ["QUEUED", "FAILED"] }, attempts: { lt: MAX_ATTEMPTS } },
    data: { status: "SENDING", attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return "skipped";

  const row = await db.notificationOutbox.findUniqueOrThrow({ where: { id } });
  const template = row.template as TemplateName;
  const payload = (row.payload ?? {}) as Record<string, unknown>;

  try {
    if (row.channel === "TELEGRAM") {
      await telegramSend(row.recipient, renderTelegram(template, payload));
    } else {
      await sendMail(row.recipient, renderEmail(template, payload));
    }
    await db.notificationOutbox.update({
      where: { id },
      data: { status: "SENT", sentAt: new Date(), lastError: null },
    });
    return "sent";
  } catch (err) {
    const de = err instanceof DeliveryError ? err : new DeliveryError((err as Error).message, false);
    const exhausted = de.permanent || row.attempts >= MAX_ATTEMPTS;
    const delay = de.retryAfterSec ? de.retryAfterSec * 1000 : backoffMs(row.attempts);
    await db.notificationOutbox.update({
      where: { id },
      data: {
        status: "FAILED",
        lastError: de.message.slice(0, 2000),
        // Exhausted rows are parked: attempts = MAX keeps the sweeper away.
        attempts: exhausted ? MAX_ATTEMPTS : undefined,
        scheduledAt: new Date(Date.now() + delay),
      },
    });
    console.warn(`[notify] ${row.channel} ${template} → ${exhausted ? "gave up" : "retry"}: ${de.message}`);
    return "failed";
  }
}

/**
 * Re-queues rows the consumer hasn't handled: retries that are now due,
 * rows whose Redis push was lost, and rows stuck in SENDING after a crash.
 */
export async function sweepOutbox(): Promise<number> {
  const now = new Date();
  const stuckBefore = new Date(Date.now() - 5 * 60_000);
  const orphanBefore = new Date(Date.now() - 60_000);

  await db.notificationOutbox.updateMany({
    where: { status: "SENDING", createdAt: { lt: stuckBefore }, sentAt: null, scheduledAt: { lt: stuckBefore } },
    data: { status: "FAILED", lastError: "Worker interrupted while sending" },
  });

  const due = await db.notificationOutbox.findMany({
    where: {
      attempts: { lt: MAX_ATTEMPTS },
      OR: [
        { status: "FAILED", scheduledAt: { lte: now } },
        { status: "QUEUED", createdAt: { lt: orphanBefore } },
      ],
    },
    select: { id: true },
    orderBy: { scheduledAt: "asc" },
    take: 200,
  });
  if (due.length) await redis().lpush(QUEUE_KEY, ...due.map((d) => d.id));
  return due.length;
}
