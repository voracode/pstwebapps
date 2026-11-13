import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/env";
import { DeliveryError } from "./telegram";

let transporter: Transporter | undefined;

export function mailConfigured(): boolean {
  return !!env().SMTP_HOST;
}

function getTransport(): Transporter {
  if (transporter) return transporter;
  const e = env();
  transporter = nodemailer.createTransport({
    host: e.SMTP_HOST,
    port: e.SMTP_PORT,
    secure: e.SMTP_SECURE,
    auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD } : undefined,
    pool: true,
    maxConnections: 3,
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    tls: { minVersion: "TLSv1.2" },
  });
  return transporter;
}

export async function sendMail(to: string, mail: { subject: string; html: string; text: string }): Promise<void> {
  const e = env();
  if (!mailConfigured()) {
    if (e.NODE_ENV !== "production") {
      console.info(`[mail:dev] to=${to} subject="${mail.subject}"\n${mail.text}`);
      return;
    }
    throw new DeliveryError("SMTP not configured", true);
  }
  try {
    await getTransport().sendMail({
      from: e.MAIL_FROM,
      replyTo: e.MAIL_REPLY_TO,
      to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
  } catch (err) {
    const code = (err as { responseCode?: number }).responseCode;
    // 5xx = permanent rejection (bad mailbox, policy); everything else is retried.
    throw new DeliveryError(`SMTP error: ${(err as Error).message}`, !!code && code >= 500 && code < 600);
  }
}
