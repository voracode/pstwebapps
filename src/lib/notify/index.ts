import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { env } from "@/env";
import type { Prisma } from "@/generated/prisma/client";
import type { TemplateName } from "./templates";
import { telegramConfigured } from "./telegram";

/**
 * Notification entry point used by request handlers.
 *
 * Every notification is written to `notification_outbox` first (durable),
 * then its id is pushed onto a Redis list for the worker. If Redis is down
 * the row stays QUEUED and the worker's sweeper picks it up later, so an
 * alert is never lost and a slow Telegram/SMTP never blocks a request.
 */

export const QUEUE_KEY = "notify:queue";

export type AlertTopic = "registrations" | "aspirations" | "contact" | "security" | "system";

function chatIdsFor(topic: AlertTopic): string[] {
  const e = env();
  const specific: Record<AlertTopic, string | undefined> = {
    registrations: e.TELEGRAM_CHAT_ID_REGISTRATIONS,
    aspirations: e.TELEGRAM_CHAT_ID_ASPIRATIONS,
    contact: e.TELEGRAM_CHAT_ID_ASPIRATIONS,
    security: e.TELEGRAM_CHAT_ID_SECURITY,
    system: e.TELEGRAM_CHAT_ID_SYSTEM,
  };
  const id = specific[topic] || e.TELEGRAM_ADMIN_CHAT_ID;
  return id ? [id] : [];
}

async function enqueue(
  channel: "TELEGRAM" | "EMAIL",
  recipient: string,
  template: TemplateName,
  payload: Record<string, unknown>,
): Promise<void> {
  const row = await db.notificationOutbox.create({
    data: { channel, recipient, template, payload: payload as Prisma.InputJsonValue },
    select: { id: true },
  });
  try {
    await redis().lpush(QUEUE_KEY, row.id);
  } catch (err) {
    console.warn("[notify] redis push failed, sweeper will retry:", (err as Error).message);
  }
}

/** Telegram alert to the admin group(s) for a topic. Never throws. */
export async function alertAdmins(
  topic: AlertTopic,
  template: TemplateName,
  payload: Record<string, unknown>,
  opts: { alsoEmailInbox?: boolean } = {},
): Promise<void> {
  try {
    if (telegramConfigured()) {
      for (const chatId of chatIdsFor(topic)) await enqueue("TELEGRAM", chatId, template, payload);
    }
    const inbox = env().MAIL_ADMIN_INBOX;
    if (opts.alsoEmailInbox && inbox) await enqueue("EMAIL", inbox, template, payload);
  } catch (err) {
    console.error(`[notify] alertAdmins(${topic}, ${template}) failed:`, err);
  }
}

/** Transactional e-mail to a single recipient. Never throws. */
export async function sendEmail(to: string, template: TemplateName, payload: Record<string, unknown>): Promise<void> {
  try {
    await enqueue("EMAIL", to.trim().toLowerCase(), template, payload);
  } catch (err) {
    console.error(`[notify] sendEmail(${template}) failed:`, err);
  }
}

/** Direct Telegram to one user (personal chat id on their profile). Never throws. */
export async function alertUser(chatId: string | null | undefined, template: TemplateName, payload: Record<string, unknown>) {
  if (!chatId || !telegramConfigured()) return;
  try {
    await enqueue("TELEGRAM", chatId, template, payload);
  } catch (err) {
    console.error(`[notify] alertUser(${template}) failed:`, err);
  }
}
