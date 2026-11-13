import { readFile } from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { esc } from "@/lib/notify/templates";

/**
 * KTA card renderer. Both faces are built as SVG, rasterised with sharp
 * (librsvg) at 300 dpi CR80 size (85.6 × 53.98 mm → 1011 × 638 px), then
 * packed into a 2-page PDF sized exactly to the card for ID-card printers.
 *
 * Fonts: the container must ship DejaVu Sans (Dockerfile, Phase 4);
 * otherwise librsvg falls back to whatever sans-serif fontconfig finds.
 */

export const CARD_W = 1011;
export const CARD_H = 638;
const MM_TO_PT = 72 / 25.4;

const RED = "#D91C1F";
const GOLD = "#FACC15";
const BLACK = "#0F172A";
const FONT = "DejaVu Sans, Arial, Helvetica, sans-serif";
const MONO = "DejaVu Sans Mono, Consolas, monospace";

export interface CardData {
  memberNumber: string;
  fullName: string;
  municipality: string;
  adminPost?: string | null;
  rank: string;
  issuedAt: string; // YYYY-MM-DD
  expiresAt: string; // YYYY-MM-DD
  version: number;
  verifyUrl: string;
  photo?: Buffer | null;
  signature: string;
  kid: string;
}

const RANK_LABEL: Record<string, string> = {
  SYMPATHIZER: "SIMPATIZANTE",
  MILITANT: "MILITANTE",
  CADRE: "KUADRU / QUADRO",
};

let emblemDataUri: Promise<string> | undefined;
function emblem(): Promise<string> {
  emblemDataUri ??= readFile(path.join(process.cwd(), "public", "brand", "emblem.png")).then(
    (b) => `data:image/png;base64,${b.toString("base64")}`,
  );
  return emblemDataUri;
}

const ddmmyyyy = (iso: string) => iso.split("-").reverse().join("/");

/** Shrinks the name font so long Timorese names (often 4–5 parts) still fit. */
// The name column is ~450 px wide (x 304 → QR box at 778). Bold DejaVu caps
// average ~0.62 em, so these limits keep every line clear of the QR code.
function nameLines(name: string): { lines: string[]; size: number } {
  const upper = name.toUpperCase().replace(/\s+/g, " ").trim();
  if (upper.length <= 18) return { lines: [upper], size: 38 };
  const wrap = (max: number) => {
    const lines: string[] = [""];
    for (const w of upper.split(" ")) {
      const cur = lines[lines.length - 1]!;
      if (cur && `${cur} ${w}`.length > max) lines.push(w);
      else lines[lines.length - 1] = cur ? `${cur} ${w}` : w;
    }
    return lines;
  };
  const two = wrap(22);
  if (two.length <= 2) return { lines: two, size: 31 };
  const three = wrap(26);
  // Extremely long names: keep 3 lines, truncate the last one.
  const kept = three.slice(0, 3);
  if (three.length > 3) kept[2] = `${kept[2]!.slice(0, 24)}…`;
  return { lines: kept, size: 26 };
}

async function photoDataUri(photo: Buffer | null | undefined): Promise<string | null> {
  if (!photo) return null;
  const jpg = await sharp(photo).resize(230, 290, { fit: "cover", position: "attention" }).jpeg({ quality: 88 }).toBuffer();
  return `data:image/jpeg;base64,${jpg.toString("base64")}`;
}

async function frontSvg(d: CardData): Promise<string> {
  const [logo, photo, qr] = await Promise.all([
    emblem(),
    photoDataUri(d.photo),
    QRCode.toDataURL(d.verifyUrl, { errorCorrectionLevel: "M", margin: 1, width: 400, color: { dark: BLACK, light: "#FFFFFF" } }),
  ]);
  const initials = d.fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  const { lines, size } = nameLines(d.fullName);
  const nameY = 238;
  const lineH = size + 6;
  const afterName = nameY + lineH * (lines.length - 1);

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  <defs>
    <clipPath id="card"><rect width="${CARD_W}" height="${CARD_H}" rx="36"/></clipPath>
    <linearGradient id="hdr" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#B91518"/><stop offset="1" stop-color="${RED}"/></linearGradient>
  </defs>
  <g clip-path="url(#card)">
    <rect width="${CARD_W}" height="${CARD_H}" fill="#FFFFFF"/>
    <!-- faint star watermark -->
    <path transform="translate(620 330) scale(5.2)" fill="${RED}" fill-opacity="0.05" d="M0,-30 L7,-9 L29,-9 L11,4 L18,26 L0,12 L-18,26 L-11,4 L-29,-9 L-7,-9Z"/>
    <rect width="${CARD_W}" height="150" fill="url(#hdr)"/>
    <rect y="150" width="${CARD_W}" height="6" fill="${GOLD}"/>
    <image x="26" y="15" width="120" height="120" href="${logo}" xlink:href="${logo}"/>
    <text x="166" y="66" font-family="${FONT}" font-size="36" font-weight="bold" fill="#FFFFFF" letter-spacing="1">PARTIDO SOCIALISTA DE TIMOR</text>
    <text x="168" y="108" font-family="${FONT}" font-size="22" font-weight="bold" fill="${GOLD}" letter-spacing="3">KARTAUN MEMBRU · CARTÃO DE MEMBRO</text>

    <rect x="36" y="186" width="238" height="298" rx="10" fill="${GOLD}"/>
    ${
      photo
        ? `<image x="40" y="190" width="230" height="290" preserveAspectRatio="xMidYMid slice" href="${photo}" xlink:href="${photo}"/>`
        : `<rect x="40" y="190" width="230" height="290" fill="#E2E8F0"/><text x="155" y="360" text-anchor="middle" font-family="${FONT}" font-size="84" font-weight="bold" fill="#94A3B8">${esc(initials)}</text>`
    }

    <text x="304" y="200" font-family="${FONT}" font-size="15" fill="#64748B" letter-spacing="2">NARAN · NOME</text>
    ${lines.map((l, i) => `<text x="304" y="${nameY + i * lineH}" font-family="${FONT}" font-size="${size}" font-weight="bold" fill="${BLACK}">${esc(l)}</text>`).join("\n    ")}

    <text x="304" y="${afterName + 50}" font-family="${FONT}" font-size="15" fill="#64748B" letter-spacing="2">Nº KTA</text>
    <text x="304" y="${afterName + 88}" font-family="${MONO}" font-size="34" font-weight="bold" fill="${RED}">${esc(d.memberNumber)}</text>

    <text x="304" y="${afterName + 132}" font-family="${FONT}" font-size="15" fill="#64748B" letter-spacing="2">MUNISÍPIU · MUNICÍPIO</text>
    <text x="304" y="${afterName + 162}" font-family="${FONT}" font-size="25" font-weight="bold" fill="${BLACK}">${esc(d.municipality)}${d.adminPost ? ` · ${esc(d.adminPost)}` : ""}</text>

    <text x="304" y="${afterName + 206}" font-family="${FONT}" font-size="15" fill="#64748B" letter-spacing="2">KATEGORIA</text>
    <text x="304" y="${afterName + 234}" font-family="${FONT}" font-size="22" font-weight="bold" fill="${BLACK}">${esc(RANK_LABEL[d.rank] ?? d.rank)}</text>
    <text x="560" y="${afterName + 206}" font-family="${FONT}" font-size="15" fill="#64748B" letter-spacing="2">VÁLIDU TO'O · VÁLIDO ATÉ</text>
    <text x="560" y="${afterName + 234}" font-family="${FONT}" font-size="22" font-weight="bold" fill="${BLACK}">${ddmmyyyy(d.expiresAt)}</text>

    <rect x="778" y="186" width="200" height="200" rx="10" fill="#FFFFFF" stroke="${BLACK}" stroke-width="2"/>
    <image x="784" y="192" width="188" height="188" href="${qr}" xlink:href="${qr}"/>
    <text x="878" y="414" text-anchor="middle" font-family="${FONT}" font-size="15" fill="#475569">Verifika · Verificar</text>

    <rect y="${CARD_H - 62}" width="${CARD_W}" height="62" fill="${BLACK}"/>
    <text x="${CARD_W / 2}" y="${CARD_H - 22}" text-anchor="middle" font-family="${FONT}" font-size="25" font-weight="bold" fill="${GOLD}" letter-spacing="4">★  PELO PROGRESSO, IGUALDADE  ★</text>
  </g>
</svg>`;
}

async function backSvg(d: CardData): Promise<string> {
  const logo = await emblem();
  const fingerprint = `${d.kid} · ${d.signature.slice(0, 20)}…`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  <defs><clipPath id="card"><rect width="${CARD_W}" height="${CARD_H}" rx="36"/></clipPath></defs>
  <g clip-path="url(#card)">
    <rect width="${CARD_W}" height="${CARD_H}" fill="${BLACK}"/>
    <rect x="18" y="18" width="${CARD_W - 36}" height="${CARD_H - 36}" rx="24" fill="none" stroke="${GOLD}" stroke-width="3"/>
    <image x="${CARD_W / 2 - 75}" y="42" width="150" height="150" href="${logo}" xlink:href="${logo}"/>
    <text x="${CARD_W / 2}" y="236" text-anchor="middle" font-family="${FONT}" font-size="22" font-weight="bold" fill="#FFFFFF" letter-spacing="2">KARTAUN NE'E PROPRIEDADE PST · ESTE CARTÃO É PROPRIEDADE DO PST</text>
    <text x="${CARD_W / 2}" y="282" text-anchor="middle" font-family="${FONT}" font-size="18" fill="#CBD5E1">Se ita hetan kartaun ne'e, favor entrega ba sekretariadu PST besik liu.</text>
    <text x="${CARD_W / 2}" y="310" text-anchor="middle" font-family="${FONT}" font-size="18" fill="#CBD5E1">Se encontrar este cartão, entregue-o no secretariado do PST mais próximo.</text>
    <text x="${CARD_W / 2}" y="354" text-anchor="middle" font-family="${FONT}" font-size="17" fill="${GOLD}">Verifikasaun · Verificação: ${esc(new URL(d.verifyUrl).host)}/verify</text>

    <line x1="300" y1="452" x2="711" y2="452" stroke="#64748B" stroke-width="2"/>
    <text x="${CARD_W / 2}" y="480" text-anchor="middle" font-family="${FONT}" font-size="17" fill="#CBD5E1">Sekretáriu-Jerál · Secretário-Geral</text>

    <text x="44" y="${CARD_H - 70}" font-family="${FONT}" font-size="15" fill="#94A3B8">Emitidu · Emitido: ${ddmmyyyy(d.issuedAt)}   ·   Versaun ${d.version}</text>
    <text x="44" y="${CARD_H - 44}" font-family="${MONO}" font-size="14" fill="#64748B">Ed25519 ${esc(fingerprint)}</text>
    <text x="${CARD_W - 44}" y="${CARD_H - 44}" text-anchor="end" font-family="${MONO}" font-size="18" font-weight="bold" fill="${GOLD}">${esc(d.memberNumber)}</text>
  </g>
</svg>`;
}

export interface RenderedCard {
  frontPng: Buffer;
  backPng: Buffer;
  pdf: Buffer;
}

export async function renderCard(d: CardData): Promise<RenderedCard> {
  const [front, back] = await Promise.all([frontSvg(d), backSvg(d)]);
  const [frontPng, backPng] = await Promise.all([
    sharp(Buffer.from(front)).png({ compressionLevel: 9 }).toBuffer(),
    sharp(Buffer.from(back)).png({ compressionLevel: 9 }).toBuffer(),
  ]);

  const pdf = await PDFDocument.create();
  pdf.setTitle(`KTA ${d.memberNumber}`);
  pdf.setAuthor("Partido Socialista de Timor");
  pdf.setSubject("Kartaun Membru / Cartão de Membro");
  pdf.setProducer("SIM-PST");
  pdf.setCreationDate(new Date());
  const w = 85.6 * MM_TO_PT;
  const h = 53.98 * MM_TO_PT;
  for (const png of [frontPng, backPng]) {
    const img = await pdf.embedPng(png);
    pdf.addPage([w, h]).drawImage(img, { x: 0, y: 0, width: w, height: h });
  }

  return { frontPng, backPng, pdf: Buffer.from(await pdf.save()) };
}

/** Front + back stacked in one PNG (handy for WhatsApp sharing / preview). */
export async function combinedPng(card: RenderedCard): Promise<Buffer> {
  const gap = 40;
  return sharp({ create: { width: CARD_W, height: CARD_H * 2 + gap, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: card.frontPng, top: 0, left: 0 },
      { input: card.backPng, top: CARD_H + gap, left: 0 },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
}
