/**
 * Notification templates. Telegram messages use Telegram's HTML subset
 * (<b>, <i>, <code>, <a>); e-mails are bilingual Tetum / Portuguese.
 *
 * Templates never contain ID numbers, full birth dates or passwords.
 */

export type TemplateName =
  | "member.registered"
  | "member.verified"
  | "member.rejected"
  | "aspiration.submitted"
  | "aspiration.updated"
  | "contact.received"
  | "security.lockout"
  | "security.alert"
  | "security.export"
  | "auth.password_reset"
  | "user.invite"
  | "system.health"
  | "system.notice";

type Payload = Record<string, unknown>;

export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const s = (p: Payload, k: string) => esc(p[k]);

// -----------------------------------------------------------------------------
// Telegram
// -----------------------------------------------------------------------------
export function renderTelegram(template: TemplateName, p: Payload): string {
  switch (template) {
    case "member.registered":
      return [
        "🟥 <b>Rejistu Militante Foun</b> / Novo registo de militante",
        "",
        `👤 <b>${s(p, "fullName")}</b>`,
        `📍 ${s(p, "municipality")}${p.adminPost ? ` › ${s(p, "adminPost")}` : ""}${p.suco ? ` › ${s(p, "suco")}` : ""}`,
        `🧾 Ref: <code>${s(p, "registrationRef")}</code>`,
        `📥 Kanal: ${s(p, "channel")}`,
        p.adminUrl ? `\n<a href="${s(p, "adminUrl")}">Haree iha backoffice →</a>` : "",
      ].join("\n");

    case "aspiration.submitted":
      return [
        `📣 <b>Aspirasaun Foun</b> / Nova aspiração ${p.priority === "URGENT" ? "‼️" : ""}`,
        "",
        `🎫 <code>${s(p, "ticketNumber")}</code> · ${s(p, "category")}`,
        `📍 ${p.municipality ? s(p, "municipality") : "—"}`,
        `📝 <b>${s(p, "subject")}</b>`,
        p.isAnonymous ? "🕶 Anónimu" : `👤 ${s(p, "name")}`,
        p.adminUrl ? `\n<a href="${s(p, "adminUrl")}">Loke tiket →</a>` : "",
      ].join("\n");

    case "contact.received":
      return [
        "✉️ <b>Mensajen Kontaktu</b> / Mensagem de contacto",
        "",
        `👤 ${s(p, "name")}${p.email ? ` · ${s(p, "email")}` : ""}${p.phone ? ` · ${s(p, "phone")}` : ""}`,
        `📝 <b>${s(p, "subject") || "(la iha asuntu)"}</b>`,
      ].join("\n");

    case "security.lockout":
      return [
        "🔒 <b>KONTA BLOKEADU</b> / CONTA BLOQUEADA",
        "",
        `👤 <code>${s(p, "email")}</code>`,
        `🌐 IP: <code>${s(p, "ip") || "?"}</code>`,
        `❌ Tentativas falhadas: ${s(p, "attempts")}`,
        `⏱ Bloqueado até: ${s(p, "until")}`,
      ].join("\n");

    case "security.alert":
      return [
        "🚨 <b>Alerta de Segurança</b>",
        "",
        `⚙️ <code>${s(p, "action")}</code>`,
        `👤 ${s(p, "actorEmail") || "anónimo"}`,
        `🌐 IP: <code>${s(p, "ip") || "?"}</code>`,
        p.details ? `ℹ️ ${s(p, "details")}` : "",
      ].join("\n");

    case "security.export":
      return [
        "📤 <b>Exportasaun Dadus</b> / Exportação de dados",
        "",
        `👤 ${s(p, "actorEmail")} (${s(p, "actorRole")})`,
        `📊 ${s(p, "count")} registos · formato ${s(p, "format")}`,
        `🔎 Filtros: <code>${s(p, "filters")}</code>`,
        `🌐 IP: <code>${s(p, "ip") || "?"}</code>`,
      ].join("\n");

    case "system.health": {
      const icon = p.status === "ok" ? "✅" : "⚠️";
      return [`${icon} <b>Saúde do Sistema</b>: ${s(p, "status")}`, "", `<code>${s(p, "details")}</code>`].join("\n");
    }

    case "system.notice":
      return `ℹ️ <b>PST Sistema</b>\n${s(p, "message")}`;

    default:
      return `ℹ️ <b>${esc(template)}</b>\n<code>${esc(JSON.stringify(p).slice(0, 3000))}</code>`;
  }
}

// -----------------------------------------------------------------------------
// E-mail
// -----------------------------------------------------------------------------
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#F8FAFC;font-family:Arial,Helvetica,sans-serif;color:#0F172A">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:8px;overflow:hidden">
<tr><td style="background:#D91C1F;padding:18px 24px;color:#fff">
<div style="font-size:12px;letter-spacing:2px;color:#FACC15;font-weight:bold">PARTIDO SOCIALISTA DE TIMOR</div>
<div style="font-size:20px;font-weight:bold;margin-top:4px">${esc(title)}</div></td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.55">${bodyHtml}</td></tr>
<tr><td style="background:#0F172A;color:#94A3B8;padding:14px 24px;font-size:12px;text-align:center">
<span style="color:#FACC15">★</span> Pelo Progresso, Igualdade <span style="color:#FACC15">★</span></td></tr>
</table></td></tr></table></body></html>`;
}

const toText = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();

const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${esc(href)}" style="background:#D91C1F;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold">${esc(label)}</a></p>`;

export function renderEmail(template: TemplateName, p: Payload): RenderedEmail {
  let subject: string;
  let body: string;

  switch (template) {
    case "member.registered":
      subject = `PST — Rejistu simu ona / Registo recebido (${p.registrationRef})`;
      body = `<p>Olá <b>${s(p, "fullName")}</b>,</p>
<p>Obrigadu barak! Ita-nia rejistu nu'udar militante PST simu ona no sei hein verifikasaun husi koordenasaun munisipál.</p>
<p>Obrigado! O seu registo como militante do PST foi recebido e aguarda verificação pela coordenação municipal.</p>
<p>Referénsia / Referência: <b style="font-family:monospace;font-size:17px">${s(p, "registrationRef")}</b></p>
<p>Uza referénsia ne'e ho ita-nia data moris atu haree estatutu. / Use esta referência e a sua data de nascimento para consultar o estado.</p>
${p.statusUrl ? button(String(p.statusUrl), "Haree estatutu / Ver estado") : ""}`;
      break;

    case "member.verified":
      subject = `PST — Bemvindu, kamarada! / Bem-vindo, camarada! (${p.memberNumber})`;
      body = `<p>Olá <b>${s(p, "fullName")}</b>,</p>
<p>Ita-nia rejistu verifikadu ona. Ita agora militante ofisiál Partido Socialista de Timor.</p>
<p>O seu registo foi verificado. É agora militante oficial do Partido Socialista de Timor.</p>
<p>Númeru KTA / Número de membro: <b style="font-family:monospace;font-size:17px">${s(p, "memberNumber")}</b></p>
<p>Ita-nia kartaun membru sei entrega husi sekretariadu munisipál. / O seu cartão será entregue pelo secretariado municipal.</p>`;
      break;

    case "member.rejected":
      subject = `PST — Estatutu rejistu / Estado do registo (${p.registrationRef})`;
      body = `<p>Olá <b>${s(p, "fullName")}</b>,</p>
<p>Ita-nia rejistu la bele aprova iha momentu ne'e. / Não foi possível aprovar o seu registo neste momento.</p>
${p.reason ? `<p>Razaun / Motivo: <i>${s(p, "reason")}</i></p>` : ""}
<p>Kontaktu sekretariadu munisipál ba informasaun liu. / Contacte o secretariado municipal para mais informação.</p>`;
      break;

    case "aspiration.submitted":
      subject = `PST — Aspirasaun simu ona / Aspiração recebida (${p.ticketNumber})`;
      body = `<p>Obrigadu tanba fahe ita-nia lian ho PST. / Obrigado por partilhar a sua voz com o PST.</p>
<p>Tiket: <b style="font-family:monospace">${s(p, "ticketNumber")}</b></p>
<p>Rai kódigu segimentu ne'ebé hatudu iha ekran — ita presiza atu haree progresu. / Guarde o código de acompanhamento mostrado no ecrã — é necessário para consultar o progresso.</p>`;
      break;

    case "aspiration.updated":
      subject = `PST — Atualizasaun tiket / Atualização do pedido (${p.ticketNumber})`;
      body = `<p>Tiket <b style="font-family:monospace">${s(p, "ticketNumber")}</b>: <b>${s(p, "status")}</b></p>
${p.message ? `<blockquote style="border-left:3px solid #FACC15;margin:0;padding:8px 12px;background:#FFFBEB">${s(p, "message")}</blockquote>` : ""}`;
      break;

    case "contact.received":
      subject = `[PST Kontaktu] ${String(p.subject ?? "Mensajen foun")}`;
      body = `<p><b>${s(p, "name")}</b> ${p.email ? `&lt;${s(p, "email")}&gt;` : ""} ${p.phone ? `· ${s(p, "phone")}` : ""}</p>
<p style="white-space:pre-wrap">${s(p, "message")}</p>`;
      break;

    case "security.lockout":
      subject = "PST Backoffice — Konta blokeadu temporariamente / Conta bloqueada temporariamente";
      body = `<p>Ita-nia konta backoffice blokeadu tanba tentativa login falhadu barak. / A sua conta foi bloqueada após várias tentativas de login falhadas.</p>
<p>IP: <code>${s(p, "ip") || "?"}</code><br>Até / To'o: ${s(p, "until")}</p>
<p>Se la'ós ita, kontaktu kedas administradór. / Se não foi você, contacte imediatamente o administrador.</p>`;
      break;

    case "auth.password_reset":
      subject = "PST Backoffice — Troka password / Redefinir palavra-passe";
      body = `<p>Olá ${s(p, "name")},</p>
<p>Ema ruma husu atu troka password ba ita-nia konta. / Foi pedida a redefinição da palavra-passe da sua conta.</p>
${button(String(p.resetUrl), "Troka password / Redefinir")}
<p style="font-size:13px;color:#64748B">Link ne'e válidu ba minutu ${s(p, "expiresMinutes")}. Se la'ós ita, ignora e-mail ne'e. / Válido durante ${s(p, "expiresMinutes")} minutos. Se não foi você, ignore este e-mail.</p>`;
      break;

    case "user.invite":
      subject = "PST Backoffice — Konvite / Convite";
      body = `<p>Olá ${s(p, "name")},</p>
<p>Konta backoffice PST kria ona ba ita (<b>${s(p, "role")}</b>). Define ita-nia password atu hahú. / Foi criada uma conta no backoffice do PST para si. Defina a sua palavra-passe para começar.</p>
${button(String(p.resetUrl), "Define password / Definir palavra-passe")}
<p style="font-size:13px;color:#64748B">Válidu / Válido: ${s(p, "expiresHours")} h.</p>`;
      break;

    default:
      subject = `PST — ${template}`;
      body = `<pre>${esc(JSON.stringify(p, null, 2))}</pre>`;
  }

  const html = layout(subject.replace(/^PST( Backoffice)? — /, ""), body);
  return { subject, html, text: toText(body) };
}
