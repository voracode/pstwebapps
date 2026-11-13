import { env } from "@/env";

export class DeliveryError extends Error {
  constructor(
    message: string,
    /** Permanent errors are not retried (bad chat id, bot blocked, disabled). */
    readonly permanent: boolean,
    /** Seconds the provider asked us to wait (Telegram 429). */
    readonly retryAfterSec?: number,
  ) {
    super(message);
  }
}

export function telegramConfigured(): boolean {
  const e = env();
  return e.TELEGRAM_ENABLED && !!e.TELEGRAM_BOT_TOKEN;
}

interface TelegramResponse {
  ok: boolean;
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number };
}

/** Telegram hard limit is 4096 chars per message. */
const MAX_LEN = 4000;

export async function telegramSend(chatId: string, html: string): Promise<void> {
  const e = env();
  if (!telegramConfigured()) throw new DeliveryError("Telegram disabled or token missing", true);

  const text = html.length > MAX_LEN ? `${html.slice(0, MAX_LEN)}…` : html;
  let res: Response;
  try {
    res = await fetch(`https://api.telegram.org/bot${e.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new DeliveryError(`Telegram network error: ${(err as Error).message}`, false);
  }

  const body = (await res.json().catch(() => ({ ok: false }))) as TelegramResponse;
  if (res.ok && body.ok) return;

  const description = body.description ?? `HTTP ${res.status}`;
  if (res.status === 429) {
    throw new DeliveryError(`Telegram rate limited: ${description}`, false, body.parameters?.retry_after ?? 30);
  }
  // 400 (bad chat id / markup), 401/404 (bad or revoked token), 403 (bot blocked/kicked) won't fix themselves.
  const permanent = [400, 401, 403, 404].includes(res.status);
  throw new DeliveryError(`Telegram error: ${description}`, permanent);
}
