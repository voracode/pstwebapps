import { NextResponse } from "next/server";
import { env } from "@/env";
import { db } from "@/lib/db";
import { publicRoute } from "@/lib/http";
import { safeEqual } from "@/lib/security/crypto";
import { esc } from "@/lib/notify/templates";
import { telegramSend } from "@/lib/notify/telegram";
import { systemHealth } from "@/server/services/dashboard.service";

/**
 * POST /api/telegram/webhook — optional bot commands for the admin groups.
 * Register once:
 *   curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
 *     -d url=https://pst.tl/api/telegram/webhook -d secret_token=<TELEGRAM_WEBHOOK_SECRET>
 *
 * Only chats configured in TELEGRAM_*_CHAT_ID get answers; everything else
 * is silently ignored. Commands are read-only aggregates — no personal data.
 */
interface Update {
  message?: { chat?: { id?: number }; text?: string };
}

function allowedChats(): Set<string> {
  const e = env();
  return new Set(
    [e.TELEGRAM_ADMIN_CHAT_ID, e.TELEGRAM_CHAT_ID_REGISTRATIONS, e.TELEGRAM_CHAT_ID_ASPIRATIONS, e.TELEGRAM_CHAT_ID_SECURITY, e.TELEGRAM_CHAT_ID_SYSTEM]
      .filter((x): x is string => !!x),
  );
}

async function reply(command: string): Promise<string> {
  switch (command) {
    case "/stats": {
      const rows = await db.member.groupBy({ by: ["status"], where: { deletedAt: null }, _count: true });
      const by = Object.fromEntries(rows.map((r) => [r.status, r._count]));
      const total = rows.reduce((a, r) => a + r._count, 0);
      return [
        "📊 <b>SIM-PST</b>",
        `Total: <b>${total}</b>`,
        `✅ Verifikadu: ${by.VERIFIED ?? 0}`,
        `⏳ Pendente: ${by.PENDING ?? 0}`,
        `⛔ Suspensu: ${by.SUSPENDED ?? 0}`,
        `✖️ Rejeitadu: ${by.REJECTED ?? 0}`,
      ].join("\n");
    }
    case "/pending": {
      const rows = await db.member.groupBy({ by: ["municipalityId"], where: { deletedAt: null, status: "PENDING" }, _count: true });
      const muns = await db.municipality.findMany({ select: { id: true, name: true } });
      const name = new Map(muns.map((m) => [m.id, m.name]));
      if (!rows.length) return "✅ La iha rejistu pendente. / Sem registos pendentes.";
      return ["⏳ <b>Pendente tuir munisípiu</b>", ...rows.sort((a, b) => b._count - a._count).map((r) => `• ${esc(name.get(r.municipalityId))}: ${r._count}`)].join("\n");
    }
    case "/aspirations": {
      const open = await db.aspiration.count({ where: { status: { in: ["NEW", "ACKNOWLEDGED", "IN_REVIEW", "FORWARDED"] } } });
      const urgent = await db.aspiration.count({ where: { priority: "URGENT", status: { notIn: ["RESOLVED", "CLOSED", "SPAM"] } } });
      return `📣 Aspirasaun loke / abertas: <b>${open}</b>\n‼️ Urjente: <b>${urgent}</b>`;
    }
    case "/health": {
      const h = await systemHealth();
      return [`${h.status === "ok" ? "✅" : "⚠️"} <b>${h.status}</b>`, ...Object.entries(h.checks).map(([k, c]) => `${c.ok ? "🟢" : "🔴"} ${k}${c.detail ? ` — ${esc(c.detail)}` : ""}${c.latencyMs !== undefined ? ` (${c.latencyMs} ms)` : ""}`)].join("\n");
    }
    default:
      return "🤖 <b>PST Bot</b>\n/stats — militantes\n/pending — pendentes por município\n/aspirations — aspirações abertas\n/health — estado do sistema";
  }
}

export const POST = publicRoute(async ({ req }) => {
  const secret = env().TELEGRAM_WEBHOOK_SECRET;
  const header = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!secret || !safeEqual(header, secret)) return new NextResponse(null, { status: 404 });

  const update = (await req.json().catch(() => ({}))) as Update;
  const chatId = update.message?.chat?.id?.toString();
  const text = update.message?.text?.trim() ?? "";
  if (!chatId || !text.startsWith("/") || !allowedChats().has(chatId)) return NextResponse.json({ ok: true });

  const command = text.split(/[\s@]/)[0]!.toLowerCase();
  try {
    await telegramSend(chatId, await reply(command));
  } catch (err) {
    console.error("[telegram:webhook]", (err as Error).message);
  }
  // Always 200 so Telegram doesn't retry the update.
  return NextResponse.json({ ok: true });
});
