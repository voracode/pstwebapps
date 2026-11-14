/**
 * Demo / sample data for testing and presentations — NOT for a public launch.
 *
 *   npx tsx scripts/demo-data.ts            create demo data
 *   npx tsx scripts/demo-data.ts --remove   delete exactly what was created
 *
 * In Docker (VPS):
 *   docker compose --env-file .env.production run --rm migrate npx tsx scripts/demo-data.ts
 *   docker compose --env-file .env.production run --rm migrate npx tsx scripts/demo-data.ts --remove
 *
 * Safety rules
 *  - Every title / name carries "[CONTOH]"; generated images and PDFs say
 *    "CONTOH / EXEMPLO" so nothing can be mistaken for official information.
 *  - No invented people as party officials, no fake phone numbers or addresses.
 *  - Demo members get KTA numbers in a separate 9xxxxx range: the real
 *    numbering sequence is never touched.
 *  - Every created id is recorded in site setting "demo.ids"; --remove deletes
 *    exactly those rows (and their files) and nothing else.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { randomCode, randomToken } from "@/lib/security/crypto";
import { readingMinutes, sanitizeRichText } from "@/lib/sanitize";
import { deleteObject } from "@/lib/storage";
import { storeUpload } from "@/lib/storage/upload";
import type { Locale, Prisma } from "@/generated/prisma/client";

const KEY = "demo.ids";
const TAG = "[CONTOH]";
const REMOVE = process.argv.includes("--remove");

type Ids = {
  media: string[];
  posts: string[];
  events: string[];
  documents: string[];
  heroSlides: string[];
  branches: string[];
  albums: string[];
  members: string[];
  aspirations: string[];
  contacts: string[];
  sections: string[];
};
const emptyIds = (): Ids => ({
  media: [], posts: [], events: [], documents: [], heroSlides: [], branches: [],
  albums: [], members: [], aspirations: [], contacts: [], sections: [],
});

/** tr(tet, pt, id, en) → translation rows */
const tr = <T extends Record<string, unknown>>(rows: Record<Locale, T>) =>
  (Object.entries(rows) as [Locale, T][]).map(([locale, data]) => ({ locale, ...data }));

const DAY = 86_400_000;
const daysFromNow = (d: number, hourDili = 9) => {
  const t = new Date(Date.now() + d * DAY);
  // Dili is UTC+9 (no DST): 09:00 Dili = 00:00 UTC.
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), hourDili - 9));
};

// -----------------------------------------------------------------------------
// Generated assets (clearly marked as samples)
// -----------------------------------------------------------------------------
const emblemPng = readFileSync(path.join(process.cwd(), "public", "brand", "emblem.png"));

async function demoImage(label: string, variant: number, ids: Ids, caption = true): Promise<string> {
  const palettes = [
    ["#8f1013", "#d91c1f"],
    ["#0f172a", "#b91518"],
    ["#b91518", "#f59e0b"],
    ["#1e293b", "#d91c1f"],
  ];
  const [a, b] = palettes[variant % palettes.length]!;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
    <rect width="1600" height="900" fill="url(#g)"/>
    <g fill="#facc15" fill-opacity="0.12">${Array.from({ length: 14 }, (_, i) => `<path transform="translate(${(i * 137) % 1600} ${(i * 263) % 900}) scale(${2 + (i % 3)})" d="M0,-30 L7,-9 L29,-9 L11,4 L18,26 L0,12 L-18,26 L-11,4 L-29,-9 L-7,-9Z"/>`).join("")}</g>
    <rect x="70" y="70" width="330" height="70" rx="12" fill="#facc15"/>
    <text x="235" y="118" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="36" font-weight="bold" fill="#0f172a">CONTOH · EXEMPLO</text>
    ${caption ? `<text x="800" y="640" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="58" font-weight="bold" fill="#ffffff">${esc(label)}</text>
    <text x="800" y="710" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="30" fill="#fde68a">Imajen ilustrasaun · Imagem ilustrativa</text>` : ""}
  </svg>`;
  const emblem = await sharp(emblemPng).resize(300, 300).png().toBuffer();
  const png = await sharp(Buffer.from(svg)).composite([{ input: emblem, top: 190, left: 650 }]).png().toBuffer();
  const up = await storeUpload(new File([png], `contoh-${variant}.png`), { accept: ["IMAGE"], visibility: "PUBLIC", folder: "demo" });
  const media = await db.mediaAsset.create({
    data: { ...up, kind: "IMAGE", visibility: "PUBLIC", altText: { tet: `${TAG} ${label}`, pt: `${TAG} ${label}` }, credit: "Imajen kontoh / Imagem de exemplo" },
  });
  ids.media.push(media.id);
  return media.id;
}

async function demoPdf(title: string, ids: Ids): Promise<string> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([595, 842]);
  page.drawRectangle({ x: 0, y: 762, width: 595, height: 80, color: rgb(0.85, 0.11, 0.12) });
  page.drawText("PARTIDO SOCIALISTA DE TIMOR", { x: 40, y: 800, size: 18, font: bold, color: rgb(1, 1, 1) });
  page.drawText("Pelo Progresso, Igualdade", { x: 40, y: 778, size: 11, font, color: rgb(0.98, 0.8, 0.08) });
  page.drawText("DOKUMENTU KONTOH / DOCUMENTO DE EXEMPLO", { x: 40, y: 700, size: 16, font: bold, color: rgb(0.7, 0.33, 0.04) });
  page.drawText(title, { x: 40, y: 660, size: 14, font: bold, color: rgb(0.06, 0.09, 0.16) });
  const lines = [
    "Ida-ne'e dokumentu kontoh ba teste sistema de'it.",
    "La'ós dokumentu ofisiál Partido Socialista de Timor.",
    "",
    "Este e um documento de exemplo, apenas para testar o sistema.",
    "Nao e um documento oficial do Partido Socialista de Timor.",
  ];
  lines.forEach((l, i) => page.drawText(l, { x: 40, y: 610 - i * 20, size: 11, font, color: rgb(0.2, 0.25, 0.33) }));
  const bytes = Buffer.from(await pdf.save());
  const up = await storeUpload(new File([bytes], "dokumentu-kontoh.pdf"), { accept: ["DOCUMENT"], visibility: "PUBLIC", folder: "demo" });
  const media = await db.mediaAsset.create({ data: { ...up, kind: "DOCUMENT", visibility: "PUBLIC", originalName: "dokumentu-kontoh.pdf" } });
  ids.media.push(media.id);
  return media.id;
}

// -----------------------------------------------------------------------------
// Create
// -----------------------------------------------------------------------------
async function create() {
  const existing = await db.siteSetting.findUnique({ where: { key: KEY } });
  if (existing) {
    console.log("Demo data already present. Remove it first: npx tsx scripts/demo-data.ts --remove");
    return;
  }
  const ids = emptyIds();
  // Record progressively so a failed run can still be removed cleanly.
  const save = () => db.siteSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: ids as unknown as Prisma.InputJsonValue }, update: { value: ids as unknown as Prisma.InputJsonValue } });
  await save();

  try {
    const muns = await db.municipality.findMany({ orderBy: { sortOrder: "asc" } });
    const mun = (code: string) => muns.find((m) => m.code === code)!;
    const cats = await db.category.findMany();
    const cat = (key: string) => cats.find((c) => c.key === key)?.id;
    const admin = await db.user.findFirst({ where: { role: "SUPER_ADMIN" }, orderBy: { createdAt: "asc" } });

    // ---- hero slides ---------------------------------------------------------
    for (const [i, s] of [
      { tet: "Hamutuk ba Timor-Leste ida ne'ebé justu", pt: "Juntos por um Timor-Leste justo", id: "Bersama untuk Timor-Leste yang adil", en: "Together for a fair Timor-Leste", href: "/join" },
      { tet: "Fahe ita-nia lian ho PST", pt: "Partilhe a sua voz com o PST", id: "Sampaikan suara Anda kepada PST", en: "Share your voice with PST", href: "/voice" },
    ].entries()) {
      const imageId = await demoImage(s.en, i, ids, false);
      const slide = await db.heroSlide.create({
        data: {
          imageId, ctaHref: s.href, sortOrder: i, isActive: true,
          translations: { create: tr({
            TET: { headline: `${TAG} ${s.tet}`, subline: "Slide kontoh ba teste.", ctaLabel: i === 0 ? "Rejista agora" : "Haruka aspirasaun" },
            PT: { headline: `${TAG} ${s.pt}`, subline: "Diapositivo de exemplo para testes.", ctaLabel: i === 0 ? "Inscrever-se" : "Enviar aspiração" },
            ID: { headline: `${TAG} ${s.id}`, subline: "Slide contoh untuk pengujian.", ctaLabel: i === 0 ? "Daftar" : "Kirim aspirasi" },
            EN: { headline: `${TAG} ${s.en}`, subline: "Sample slide for testing.", ctaLabel: i === 0 ? "Join now" : "Send an aspiration" },
          }) },
        },
      });
      ids.heroSlides.push(slide.id);
    }
    await save();

    // ---- posts ------------------------------------------------------------------
    const posts: { type: "NEWS" | "PRESS_RELEASE" | "STATEMENT" | "ARTICLE"; cat?: string; days: number; mun?: string; t: Record<Locale, string>; hero?: boolean; featured?: boolean }[] = [
      { type: "STATEMENT", days: -1, hero: true, t: { TET: "PST apoia diálogu nasionál kona-ba empregu ba foin-sa'e", PT: "PST apoia diálogo nacional sobre emprego jovem", ID: "PST mendukung dialog nasional tentang lapangan kerja pemuda", EN: "PST supports a national dialogue on youth employment" } },
      { type: "PRESS_RELEASE", cat: "press-release", days: -2, hero: true, t: { TET: "Komunikadu: Sorumutu Komité Sentrál nian", PT: "Comunicado: Reunião do Comité Central", ID: "Siaran pers: Rapat Komite Sentral", EN: "Press release: Central Committee meeting" } },
      { type: "NEWS", cat: "municipal-news", days: -3, mun: "BA", featured: true, t: { TET: "Diskusaun komunitária kona-ba agrikultura iha Baucau", PT: "Debate comunitário sobre agricultura em Baucau", ID: "Diskusi komunitas tentang pertanian di Baucau", EN: "Community discussion on agriculture in Baucau" } },
      { type: "NEWS", cat: "political-education", days: -5, t: { TET: "Formasaun polítika ba militante foun sira", PT: "Formação política para novos militantes", ID: "Pendidikan politik untuk anggota baru", EN: "Political education for new members" } },
      { type: "ARTICLE", cat: "opinion", days: -7, t: { TET: "Opiniaun: Ekonomia populár no koperativa", PT: "Opinião: Economia popular e cooperativas", ID: "Opini: Ekonomi kerakyatan dan koperasi", EN: "Opinion: People's economy and cooperatives" } },
    ];
    const body = (lang: Locale) =>
      ({
        TET: "<p><strong>Ida-ne'e testu kontoh.</strong> Notísia ne'e kria ba teste website de'it no la'ós informasaun ofisiál PST.</p><p>Iha versaun finál, ekipa média sei hakerek notísia loloos iha backoffice.</p>",
        PT: "<p><strong>Este é um texto de exemplo.</strong> Esta notícia foi criada apenas para testar o website e não é informação oficial do PST.</p><p>Na versão final, a equipa de média publicará as notícias reais no backoffice.</p>",
        ID: "<p><strong>Ini teks contoh.</strong> Berita ini dibuat hanya untuk menguji situs web dan bukan informasi resmi PST.</p><p>Pada versi akhir, tim media akan menulis berita sebenarnya di backoffice.</p>",
        EN: "<p><strong>This is sample text.</strong> This article was created only to test the website and is not official PST information.</p><p>In the final version, the media team will publish real articles in the backoffice.</p>",
      })[lang];
    for (const [i, p] of posts.entries()) {
      const coverId = p.type === "STATEMENT" ? undefined : await demoImage(p.t.EN, i + 2, ids);
      const post = await db.post.create({
        data: {
          type: p.type, status: "PUBLISHED", publishedAt: daysFromNow(p.days, 10), categoryId: p.cat ? cat(p.cat) : undefined,
          municipalityId: p.mun ? mun(p.mun).id : undefined, coverId, pinnedToHero: !!p.hero, isFeatured: !!p.featured,
          authorId: admin?.id, byline: "PST (kontoh)",
          translations: {
            create: (Object.keys(p.t) as Locale[]).map((locale) => {
              const html = sanitizeRichText(body(locale));
              return {
                locale, title: `${TAG} ${p.t[locale]}`, slug: `contoh-${i + 1}-${locale.toLowerCase()}-${randomCode(4).toLowerCase()}`,
                excerpt: locale === "TET" ? "Notísia kontoh ba teste website." : locale === "PT" ? "Notícia de exemplo para testar o website." : locale === "ID" ? "Berita contoh untuk menguji situs web." : "Sample article for testing the website.",
                contentHtml: html, readingMinutes: readingMinutes(html),
              };
            }),
          },
        },
      });
      ids.posts.push(post.id);
    }
    await save();

    // ---- events ------------------------------------------------------------------
    const events: { type: "RALLY" | "POLITICAL_EDUCATION" | "COMMUNITY_DISCUSSION" | "MEETING" | "CONGRESS"; status: "SCHEDULED" | "COMPLETED"; days: number; mun: string; t: Record<Locale, string> }[] = [
      { type: "POLITICAL_EDUCATION", status: "SCHEDULED", days: 5, mun: "DI", t: { TET: "Formasaun polítika ba juventude", PT: "Formação política para a juventude", ID: "Pendidikan politik untuk pemuda", EN: "Political education for youth" } },
      { type: "COMMUNITY_DISCUSSION", status: "SCHEDULED", days: 12, mun: "BA", t: { TET: "Diskusaun komunitária: bee moos no saneamentu", PT: "Debate comunitário: água e saneamento", ID: "Diskusi komunitas: air bersih dan sanitasi", EN: "Community discussion: water and sanitation" } },
      { type: "RALLY", status: "SCHEDULED", days: 20, mun: "OE", t: { TET: "Komísiu populár iha Oé-Cusse", PT: "Comício popular em Oé-Cusse", ID: "Rapat akbar di Oé-Cusse", EN: "Public rally in Oé-Cusse" } },
      { type: "MEETING", status: "SCHEDULED", days: 33, mun: "ER", t: { TET: "Sorumutu koordenasaun munisipál Ermera", PT: "Reunião de coordenação municipal de Ermera", ID: "Rapat koordinasi munisipal Ermera", EN: "Ermera municipal coordination meeting" } },
      { type: "CONGRESS", status: "COMPLETED", days: -10, mun: "DI", t: { TET: "Konferénsia nasionál militante sira", PT: "Conferência nacional de militantes", ID: "Konferensi nasional anggota", EN: "National members' conference" } },
    ];
    for (const [i, e] of events.entries()) {
      const m = mun(e.mun);
      const ev = await db.event.create({
        data: {
          slug: `contoh-ajenda-${i + 1}-${randomCode(4).toLowerCase()}`, type: e.type, status: e.status, isPublic: true,
          startsAt: daysFromNow(e.days, 9), endsAt: daysFromNow(e.days, 12), municipalityId: m.id,
          venue: `${TAG} Fatin sei fó-sai / Local a anunciar`, latitude: m.latitude ?? undefined, longitude: m.longitude ?? undefined,
          capacity: 150, checkinToken: randomToken(24), createdById: admin?.id,
          translations: { create: tr({
            TET: { title: `${TAG} ${e.t.TET}`, summary: "Ajenda kontoh ba teste website." },
            PT: { title: `${TAG} ${e.t.PT}`, summary: "Evento de exemplo para testar o website." },
            ID: { title: `${TAG} ${e.t.ID}`, summary: "Acara contoh untuk menguji situs web." },
            EN: { title: `${TAG} ${e.t.EN}`, summary: "Sample event for testing the website." },
          }) },
        },
      });
      ids.events.push(ev.id);
    }
    await save();

    // ---- documents ---------------------------------------------------------------
    for (const [i, d] of [
      { type: "STATUTE" as const, tet: "Estatutu Partidu (kontoh)", pt: "Estatuto do Partido (exemplo)" },
      { type: "POLITICAL_PROGRAM" as const, tet: "Programa Polítiku (kontoh)", pt: "Programa Político (exemplo)" },
      { type: "BULLETIN" as const, tet: "Boletin PST — Edisaun kontoh", pt: "Boletim PST — Edição de exemplo" },
    ].entries()) {
      const fileId = await demoPdf(d.pt, ids);
      const doc = await db.document.create({
        data: {
          type: d.type, slug: `contoh-dokumentu-${i + 1}-${randomCode(4).toLowerCase()}`, versionLabel: "kontoh", isPublic: true, isFeatured: true,
          publishedAt: daysFromNow(-(i + 1) * 4), createdById: admin?.id,
          translations: { create: [
            { locale: "TET", title: `${TAG} ${d.tet}`, description: "Dokumentu kontoh — la'ós ofisiál.", fileId },
            { locale: "PT", title: `${TAG} ${d.pt}`, description: "Documento de exemplo — não oficial.", fileId },
          ] },
        },
      });
      ids.documents.push(doc.id);
    }
    await save();

    // ---- branch offices (one per município, no invented contacts) ------------
    for (const m of muns) {
      const b = await db.branchOffice.create({
        data: {
          municipalityId: m.id, name: `${TAG} Sekretariadu PST ${m.name}`, address: "Enderesu sei fó-sai / Endereço a anunciar",
          latitude: m.latitude, longitude: m.longitude, isHeadquarters: m.code === "DI", isActive: true,
          openingHours: { tet: "Segunda–Sesta 08:00–17:00 (kontoh)", pt: "Segunda a sexta 08:00–17:00 (exemplo)", id: "Senin–Jumat 08:00–17:00 (contoh)", en: "Mon–Fri 08:00–17:00 (sample)" },
        },
      });
      ids.branches.push(b.id);
    }
    await save();

    // ---- gallery album ----------------------------------------------------------
    const albumMedia = [await demoImage("Galeria 1", 1, ids), await demoImage("Galeria 2", 2, ids), await demoImage("Galeria 3", 3, ids)];
    const album = await db.album.create({
      data: {
        slug: `contoh-galeria-${randomCode(4).toLowerCase()}`, status: "PUBLISHED", publishedAt: daysFromNow(-4), coverId: albumMedia[0],
        translations: { create: tr({
          TET: { title: `${TAG} Galeria atividade`, description: "Album kontoh ho imajen ilustrasaun." },
          PT: { title: `${TAG} Galeria de atividades`, description: "Álbum de exemplo com imagens ilustrativas." },
          ID: { title: `${TAG} Galeri kegiatan`, description: "Album contoh dengan gambar ilustrasi." },
          EN: { title: `${TAG} Activity gallery`, description: "Sample album with illustrative images." },
        }) },
        items: { create: albumMedia.map((mediaId, i) => ({ mediaId, sortOrder: i, caption: { tet: `${TAG} Imajen ${i + 1}`, pt: `${TAG} Imagem ${i + 1}` } })) },
      },
    });
    ids.albums.push(album.id);
    await save();

    // ---- About / Program sections, only if the pages are still empty ----------
    for (const page of ["ABOUT", "PROGRAM"] as const) {
      if ((await db.pageSection.count({ where: { page } })) > 0) continue;
      const items = page === "ABOUT"
        ? [{ icon: null, tet: "Kona-ba PST (kontoh)", pt: "Sobre o PST (exemplo)" }]
        : [
            { icon: "sprout", tet: "Agrikultura no seguransa ai-han", pt: "Agricultura e segurança alimentar" },
            { icon: "graduation-cap", tet: "Edukasaun ba ema hotu", pt: "Educação para todos" },
            { icon: "heart-pulse", tet: "Saúde públika", pt: "Saúde pública" },
          ];
      for (const [i, s] of items.entries()) {
        const sec = await db.pageSection.create({
          data: {
            page, icon: s.icon, sortOrder: i, isVisible: true,
            translations: { create: [
              { locale: "TET", title: `${TAG} ${s.tet}`, contentHtml: "<p>Testu kontoh. Ekipa PST sei troka ho testu ofisiál iha backoffice.</p>" },
              { locale: "PT", title: `${TAG} ${s.pt}`, contentHtml: "<p>Texto de exemplo. A equipa do PST substituirá pelo texto oficial no backoffice.</p>" },
            ] },
          },
        });
        ids.sections.push(sec.id);
      }
    }
    await save();

    // ---- members (dashboard / SIM-PST demo) -----------------------------------
    const spread = ["DI", "DI", "DI", "BA", "BA", "ER", "ER", "BO", "VI", "LA", "CO", "AN", "MF", "LI", "MT", "AL", "OE", "AT", "DI", "BA", "ER", "DI", "VI", "OE", "LA", "BO", "DI", "MF"];
    const statuses = ["VERIFIED", "VERIFIED", "VERIFIED", "PENDING", "VERIFIED", "PENDING", "VERIFIED", "REJECTED", "VERIFIED", "PENDING", "VERIFIED", "SUSPENDED"] as const;
    const ranks = ["MILITANT", "MILITANT", "SYMPATHIZER", "CADRE"] as const;
    const year = new Date().getUTCFullYear();
    let seq = 900_000;
    for (const [i, code] of spread.entries()) {
      const m = mun(code);
      const status = statuses[i % statuses.length]!;
      const age = 19 + ((i * 7) % 48);
      const created = new Date(Date.now() - ((i * 29) % 30) * DAY - (i % 5) * 3_600_000);
      const verified = status === "VERIFIED" || status === "SUSPENDED";
      const member = await db.member.create({
        data: {
          registrationRef: `REG-${randomCode(8)}`, qrToken: randomToken(32), status, rank: ranks[i % ranks.length]!,
          channel: i % 3 === 0 ? "FIELD_IMPORT" : "ONLINE",
          fullName: `${TAG} Militante ${String(i + 1).padStart(2, "0")}`, gender: i % 2 === 0 ? "FEMALE" : "MALE",
          birthDate: new Date(Date.UTC(year - age, (i * 5) % 12, 1 + ((i * 3) % 27))), municipalityId: m.id,
          occupation: ["Agrikultór", "Estudante", "Profesór", "Traballadór", "Peskadór", "Enfermeira"][i % 6],
          memberNumber: verified ? `PST-${code}-${year}-${++seq}` : null,
          joinedAt: verified ? created : null, verifiedAt: verified ? created : null, verifiedById: verified ? admin?.id : null,
          rejectionReason: status === "REJECTED" ? "Kontoh: dadus la kompletu" : null,
          suspensionReason: status === "SUSPENDED" ? "Kontoh: suspensaun temporária" : null,
          consentVersion: "demo", consentAt: created, createdAt: created,
          statusChanges: { create: { toStatus: status, reason: "Dadus kontoh / dados de exemplo" } },
        },
      });
      ids.members.push(member.id);
    }
    await save();

    // Attendance for the completed demo event
    const pastEvent = ids.events[ids.events.length - 1]!;
    for (const memberId of ids.members.slice(0, 9)) {
      await db.eventAttendance.create({ data: { eventId: pastEvent, memberId, method: "QR_SCAN", checkedInAt: daysFromNow(-10, 9) } });
    }

    // ---- aspirations & contact messages ----------------------------------------
    const asp: { cat: Prisma.AspirationCreateInput["category"]; status: Prisma.AspirationCreateInput["status"]; prio: Prisma.AspirationCreateInput["priority"]; mun: string; subject: string }[] = [
      { cat: "WATER_SANITATION", status: "NEW", prio: "HIGH", mun: "BA", subject: "Bee moos la iha iha aldeia" },
      { cat: "INFRASTRUCTURE", status: "IN_REVIEW", prio: "NORMAL", mun: "ER", subject: "Estrada ba suku aat tebes" },
      { cat: "EDUCATION", status: "ACKNOWLEDGED", prio: "NORMAL", mun: "OE", subject: "Eskola presiza mestre tan" },
      { cat: "HEALTH", status: "RESOLVED", prio: "URGENT", mun: "DI", subject: "Postu saúde la iha ai-moruk" },
      { cat: "AGRICULTURE_FISHERIES", status: "FORWARDED", prio: "LOW", mun: "VI", subject: "Apoiu ba agrikultór sira" },
    ];
    for (const [i, a] of asp.entries()) {
      const row = await db.aspiration.create({
        data: {
          ticketNumber: `ASP-${year}-${randomCode(6)}`, trackingCodeHash: randomToken(32).slice(0, 64), category: a.cat, submitterType: "CITIZEN",
          isAnonymous: true, municipalityId: mun(a.mun).id, subject: `${TAG} ${a.subject}`,
          message: "Mensajen kontoh ba teste sistema. / Mensagem de exemplo para testar o sistema.",
          status: a.status, priority: a.prio, createdAt: new Date(Date.now() - (i + 1) * 2 * DAY),
          acknowledgedAt: a.status !== "NEW" ? new Date() : null, resolvedAt: a.status === "RESOLVED" ? new Date() : null,
        },
      });
      ids.aspirations.push(row.id);
    }
    for (const subject of ["Pedidu entrevista", "Informasaun kona-ba rejistu"]) {
      const c = await db.contactMessage.create({ data: { name: `${TAG} Vizitante`, subject: `${TAG} ${subject}`, message: "Mensajen kontoh ba teste. / Mensagem de exemplo." } });
      ids.contacts.push(c.id);
    }
    await save();

    await audit({ action: "system.demo_data.created", severity: "WARNING", actorEmail: "system@demo-data", metadata: Object.fromEntries(Object.entries(ids).map(([k, v]) => [k, v.length])) });
    console.log("Demo data created:");
    console.table(Object.fromEntries(Object.entries(ids).map(([k, v]) => [k, v.length])));
    console.log("Remove before going public:  npx tsx scripts/demo-data.ts --remove");
  } catch (err) {
    await save();
    console.error("Demo data creation failed — partial data is recorded and can be removed with --remove.");
    throw err;
  }
}

// -----------------------------------------------------------------------------
// Remove
// -----------------------------------------------------------------------------
async function remove() {
  const row = await db.siteSetting.findUnique({ where: { key: KEY } });
  if (!row) {
    console.log("No demo data recorded — nothing to remove.");
    return;
  }
  const ids = { ...emptyIds(), ...(row.value as Partial<Ids>) };

  const mediaKeys = (await db.mediaAsset.findMany({ where: { id: { in: ids.media } }, select: { storageKey: true } }))
    .map((m) => m.storageKey)
    .filter((k): k is string => !!k);

  const counts = await db.$transaction(async (tx) => {
    const c: Record<string, number> = {};
    c.attendances = (await tx.eventAttendance.deleteMany({ where: { OR: [{ eventId: { in: ids.events } }, { memberId: { in: ids.members } }] } })).count;
    c.members = (await tx.member.deleteMany({ where: { id: { in: ids.members } } })).count;
    c.aspirations = (await tx.aspiration.deleteMany({ where: { id: { in: ids.aspirations } } })).count;
    c.contacts = (await tx.contactMessage.deleteMany({ where: { id: { in: ids.contacts } } })).count;
    c.albums = (await tx.album.deleteMany({ where: { id: { in: ids.albums } } })).count;
    c.posts = (await tx.post.deleteMany({ where: { id: { in: ids.posts } } })).count;
    c.events = (await tx.event.deleteMany({ where: { id: { in: ids.events } } })).count;
    c.documents = (await tx.document.deleteMany({ where: { id: { in: ids.documents } } })).count;
    c.heroSlides = (await tx.heroSlide.deleteMany({ where: { id: { in: ids.heroSlides } } })).count;
    c.branches = (await tx.branchOffice.deleteMany({ where: { id: { in: ids.branches } } })).count;
    c.sections = (await tx.pageSection.deleteMany({ where: { id: { in: ids.sections } } })).count;
    c.media = (await tx.mediaAsset.deleteMany({ where: { id: { in: ids.media } } })).count;
    await tx.siteSetting.delete({ where: { key: KEY } });
    return c;
  });

  let files = 0;
  for (const key of mediaKeys) {
    try {
      await deleteObject(key);
      files++;
    } catch {
      /* already gone */
    }
  }
  await audit({ action: "system.demo_data.removed", severity: "WARNING", actorEmail: "system@demo-data", metadata: { ...counts, files } });
  console.log("Demo data removed:");
  console.table({ ...counts, files });
}

(REMOVE ? remove() : create())
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
