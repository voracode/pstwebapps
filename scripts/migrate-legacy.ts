/**
 * Imports content from the old PHP/MariaDB site (database `pst_db`) into the
 * new portal. Idempotent: every imported row carries legacySource + legacyId,
 * so re-running updates instead of duplicating.
 *
 *   LEGACY_MYSQL_URL=mysql://user:pass@host:3306/pst_db \
 *   LEGACY_SITE_ROOT=./legacy/pst-website \
 *   npx tsx scripts/migrate-legacy.ts [--dry-run]
 *
 * In Docker:  docker compose --env-file .env.production run --rm \
 *               -v /path/to/pst-website:/legacy:ro -e LEGACY_SITE_ROOT=/legacy \
 *               -e LEGACY_MYSQL_URL=… -e DATABASE_URL="$MIGRATE_DATABASE_URL" \
 *               migrate npx tsx scripts/migrate-legacy.ts
 *
 * Mapping (base columns are Tetum; *_pt / *_en become Portuguese / English):
 *   news            → Post NEWS (+ cover image)
 *   articles        → Post ARTICLE (+ cover, PDF → Document attached to the post)
 *   gallery         → MediaAsset (photo or video embed), grouped into one Album per category
 *   leadership      → Leadership CENTRAL_COMMITTEE (+ photo)
 *   programs        → PageSection PROGRAM
 *   about_sections  → PageSection ABOUT
 *   members         → Member PENDING / LEGACY_MIGRATION (must be re-verified: no ID, no consent record)
 *   contact_messages→ ContactMessage
 *   admins          → not imported (accounts are recreated with argon2id + 2FA)
 */
import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { randomCode, randomToken } from "@/lib/security/crypto";
import { sanitizeRichText, readingMinutes, videoProvider } from "@/lib/sanitize";
import { storeUpload } from "@/lib/storage/upload";
import { slugify } from "@/lib/utils/slug";
import { normalizePhone } from "@/lib/validation/common";
import type { Locale, Prisma } from "@/generated/prisma/client";

const DRY = process.argv.includes("--dry-run");
const SOURCE = "pst_db";
const SITE_ROOT = path.resolve(process.env.LEGACY_SITE_ROOT ?? "./legacy/pst-website");

const stats: Record<string, { created: number; updated: number; skipped: number }> = {};
const warnings: string[] = [];
const bump = (table: string, k: "created" | "updated" | "skipped") => {
  stats[table] ??= { created: 0, updated: 0, skipped: 0 };
  stats[table][k]++;
};
const warn = (msg: string) => {
  warnings.push(msg);
  console.warn(`  ! ${msg}`);
};

type Row = RowDataPacket & Record<string, unknown>;
const str = (v: unknown): string | undefined => {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
};

/** Plain text (with \r\n) → safe paragraphs; HTML → sanitised HTML. */
function toHtml(text: string | undefined): string | undefined {
  if (!text) return undefined;
  if (/<\/?(p|div|br|h[1-6]|ul|ol|li|strong|em|a|img|blockquote)\b/i.test(text)) return sanitizeRichText(text);
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p.trim()).replace(/\n/g, "<br>")}</p>`)
    .filter((p) => p !== "<p></p>")
    .join("\n");
}

/** Tetum base + optional PT/EN variants → translation inputs. */
function variants<T>(build: (suffix: "" | "_pt" | "_en") => T | null): { locale: Locale; data: T }[] {
  const out: { locale: Locale; data: T }[] = [];
  for (const [suffix, locale] of [["", "TET"], ["_pt", "PT"], ["_en", "EN"]] as const) {
    const data = build(suffix);
    if (data) out.push({ locale, data });
  }
  return out;
}

// -----------------------------------------------------------------------------
// Files
// -----------------------------------------------------------------------------
async function importFile(
  relPath: string | undefined,
  legacyKey: string,
  opts: { kind: "IMAGE" | "DOCUMENT"; altText?: string; visibility?: "PUBLIC" | "PRIVATE" },
): Promise<string | null> {
  if (!relPath) return null;
  const legacyId = hashId(legacyKey);
  const existing = await db.mediaAsset.findUnique({ where: { legacySource_legacyId: { legacySource: `${SOURCE}.file`, legacyId } } });
  if (existing) return existing.id;

  const clean = relPath.replace(/^\/+/, "").replace(/\\/g, "/");
  const full = path.resolve(SITE_ROOT, clean);
  if (!full.startsWith(SITE_ROOT) || !existsSync(full)) {
    warn(`file not found: ${clean}`);
    return null;
  }
  if (DRY) return "dry-run";

  const file = new File([readFileSync(full)], path.basename(full));
  try {
    const visibility = opts.visibility ?? "PUBLIC";
    const up = await storeUpload(file, { accept: [opts.kind], visibility, folder: visibility === "PUBLIC" ? "legacy" : "members/photos", maxMb: 50 });
    const media = await db.mediaAsset.create({
      data: {
        ...up,
        kind: opts.kind,
        visibility,
        altText: opts.altText ? { tet: opts.altText } : undefined,
        legacySource: `${SOURCE}.file`,
        legacyId,
      },
    });
    bump("files", "created");
    return media.id;
  } catch (err) {
    warn(`could not import ${clean}: ${(err as Error).message}`);
    return null;
  }
}

/** Stable 31-bit id from a string key (legacyId is an Int). */
function hashId(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return (h >>> 1) || 1;
}

// -----------------------------------------------------------------------------
// Posts (news + articles)
// -----------------------------------------------------------------------------
const CATEGORY_MAP: Record<string, string> = {
  "berita partidu": "party-news",
  "notisia partidu": "party-news",
  "siaran pers": "press-release",
  "komunikadu": "press-release",
  opiniaun: "opinion",
  opini: "opinion",
  "edukasaun politika": "political-education",
};

async function categoryId(legacy: string | undefined, fallback: string) {
  const key = CATEGORY_MAP[slugify(legacy ?? "").replace(/-/g, " ")] ?? fallback;
  return (await db.category.findUnique({ where: { key } }))?.id;
}

async function uniqueSlug(locale: Locale, base: string, postId?: string) {
  const root = slugify(base, 200) || "post";
  for (let i = 1; i < 50; i++) {
    const slug = i === 1 ? root : `${root}-${i}`;
    const clash = await db.postTranslation.findFirst({ where: { locale, slug, ...(postId ? { postId: { not: postId } } : {}) } });
    if (!clash) return slug;
  }
  return `${root}-${randomCode(4).toLowerCase()}`;
}

async function importPosts(conn: mysql.Connection, table: "news" | "articles") {
  const [rows] = await conn.query<Row[]>(`SELECT * FROM \`${table}\` ORDER BY id`);
  console.log(`• ${table}: ${rows.length} rows`);
  const type = table === "news" ? "NEWS" : "ARTICLE";

  for (const r of rows) {
    const legacyId = Number(r.id);
    const where = { legacySource_legacyId: { legacySource: `${SOURCE}.${table}`, legacyId } };
    const existing = await db.post.findUnique({ where, include: { translations: true } });

    const tr = variants((s) => {
      const title = str(r[`title${s}`]);
      if (!title) return null;
      const html = toHtml(str(r[`body${s}`]));
      return { title, excerpt: str(r[`excerpt${s}`]), contentHtml: html ?? null, readingMinutes: html ? readingMinutes(html) : null };
    });
    if (!tr.length) {
      bump(table, "skipped");
      continue;
    }

    const legacyCategory = str(r.category);
    const isPress = /siaran|komunikadu|comunicado|press/i.test(legacyCategory ?? "");
    const coverId = await importFile(str(r.image), `${table}.${legacyId}.image`, { kind: "IMAGE", altText: tr[0]!.data.title });

    let attachmentId: string | undefined;
    if (table === "articles" && str(r.pdf_file)) {
      const fileId = await importFile(str(r.pdf_file), `articles.${legacyId}.pdf`, { kind: "DOCUMENT" });
      if (fileId && !DRY) {
        const doc = await db.document.upsert({
          where: { legacySource_legacyId: { legacySource: `${SOURCE}.articles_pdf`, legacyId } },
          create: {
            type: "OTHER",
            slug: `${slugify(tr[0]!.data.title, 120)}-pdf-${legacyId}`,
            publishedAt: r.created_at ? new Date(String(r.created_at)) : new Date(),
            legacySource: `${SOURCE}.articles_pdf`,
            legacyId,
            translations: { create: { locale: "TET", title: tr[0]!.data.title, fileId } },
          },
          update: {},
        });
        attachmentId = doc.id;
      }
    }

    const published = str(r.status) !== "draft";
    const createdAt = r.created_at ? new Date(String(r.created_at)) : new Date();
    const data = {
      type: (isPress ? "PRESS_RELEASE" : type) as Prisma.PostCreateInput["type"],
      status: (published ? "PUBLISHED" : "DRAFT") as Prisma.PostCreateInput["status"],
      publishedAt: published ? createdAt : null,
      isFeatured: Boolean(Number(r.featured ?? 0)),
      byline: table === "articles" ? str(r.author) : undefined,
      categoryId: await categoryId(legacyCategory, table === "news" ? "party-news" : "opinion"),
      coverId: coverId && coverId !== "dry-run" ? coverId : undefined,
      attachmentId,
    };
    if (DRY) {
      bump(table, existing ? "updated" : "created");
      continue;
    }

    const post = existing
      ? await db.post.update({ where: { id: existing.id }, data })
      : await db.post.create({ data: { ...data, createdAt, legacySource: `${SOURCE}.${table}`, legacyId } });

    for (const { locale, data: t } of tr) {
      const legacySlug = locale === "TET" ? str(r.slug) : undefined;
      const current = existing?.translations.find((x) => x.locale === locale);
      const slug = current?.slug ?? (await uniqueSlug(locale, legacySlug ?? t.title, post.id));
      await db.postTranslation.upsert({
        where: { postId_locale: { postId: post.id, locale } },
        create: { postId: post.id, locale, slug, ...t },
        update: { ...t },
      });
    }
    bump(table, existing ? "updated" : "created");
  }
}

// -----------------------------------------------------------------------------
// Gallery → media + albums
// -----------------------------------------------------------------------------
async function importGallery(conn: mysql.Connection) {
  const [rows] = await conn.query<Row[]>("SELECT * FROM `gallery` ORDER BY id");
  console.log(`• gallery: ${rows.length} rows`);
  const albums = new Map<string, string>();

  for (const r of rows) {
    const legacyId = Number(r.id);
    const category = str(r.category) ?? "Galeria";
    const title = str(r.title) ?? category;
    let mediaId: string | null = null;

    if (str(r.type) === "video" && str(r.video_url)) {
      const url = str(r.video_url)!;
      if (!videoProvider(url)) {
        warn(`gallery #${legacyId}: unsupported video URL ${url}`);
        bump("gallery", "skipped");
        continue;
      }
      if (!DRY) {
        const m = await db.mediaAsset.upsert({
          where: { legacySource_legacyId: { legacySource: `${SOURCE}.gallery`, legacyId } },
          create: { kind: "VIDEO_EMBED", visibility: "PUBLIC", externalUrl: url, mimeType: `video/x-${videoProvider(url)}`, altText: { tet: title }, legacySource: `${SOURCE}.gallery`, legacyId },
          update: { externalUrl: url, altText: { tet: title } },
        });
        mediaId = m.id;
      }
    } else {
      mediaId = await importFile(str(r.file_path), `gallery.${legacyId}`, { kind: "IMAGE", altText: title });
    }
    if (!mediaId) {
      bump("gallery", "skipped");
      continue;
    }
    if (DRY) {
      bump("gallery", "created");
      continue;
    }

    const albumSlug = `galeria-${slugify(category, 80)}`;
    let albumId = albums.get(albumSlug);
    if (!albumId) {
      const album = await db.album.upsert({
        where: { slug: albumSlug },
        create: {
          slug: albumSlug,
          status: "PUBLISHED",
          publishedAt: new Date(),
          coverId: str(r.type) === "video" ? undefined : mediaId,
          translations: {
            create: variants((s) => {
              const name = str(r[`category${s}`]);
              return name ? { title: name } : null;
            }).map(({ locale, data }) => ({ locale, ...data })),
          },
        },
        update: {},
      });
      albumId = album.id;
      albums.set(albumSlug, albumId);
    }
    const caption = Object.fromEntries(
      variants((s) => str(r[`description${s}`]) ?? (s === "" ? title : null)).map(({ locale, data }) => [locale.toLowerCase(), data]),
    );
    await db.albumItem.upsert({
      where: { albumId_mediaId: { albumId, mediaId } },
      create: { albumId, mediaId, sortOrder: legacyId, caption },
      update: { caption },
    });
    bump("gallery", "created");
  }
}

// -----------------------------------------------------------------------------
// Leadership
// -----------------------------------------------------------------------------
async function importLeadership(conn: mysql.Connection) {
  const [rows] = await conn.query<Row[]>("SELECT * FROM `leadership` ORDER BY sort_order, id");
  console.log(`• leadership: ${rows.length} rows`);
  for (const r of rows) {
    const legacyId = Number(r.id);
    const fullName = str(r.name);
    if (!fullName) {
      bump("leadership", "skipped");
      continue;
    }
    const photoId = await importFile(str(r.photo), `leadership.${legacyId}`, { kind: "IMAGE", altText: fullName });
    const tr = variants((s) => {
      const positionTitle = str(r[`position${s}`]);
      return positionTitle ? { positionTitle, bio: str(r[`description${s}`]) ?? null } : null;
    });
    if (DRY) {
      bump("leadership", "created");
      continue;
    }
    const where = { legacySource_legacyId: { legacySource: `${SOURCE}.leadership`, legacyId } };
    const existing = await db.leadership.findUnique({ where });
    const data = {
      level: "CENTRAL_COMMITTEE" as const,
      fullName,
      sortOrder: Number(r.sort_order ?? legacyId),
      photoId: photoId && photoId !== "dry-run" ? photoId : null,
      isActive: true,
    };
    const row = existing
      ? await db.leadership.update({ where: { id: existing.id }, data })
      : await db.leadership.create({ data: { ...data, legacySource: `${SOURCE}.leadership`, legacyId } });
    for (const { locale, data: t } of tr) {
      await db.leadershipTranslation.upsert({
        where: { leadershipId_locale: { leadershipId: row.id, locale } },
        create: { leadershipId: row.id, locale, ...t },
        update: t,
      });
    }
    bump("leadership", existing ? "updated" : "created");
  }
}

// -----------------------------------------------------------------------------
// Page sections (programs, about)
// -----------------------------------------------------------------------------
async function importSections(conn: mysql.Connection, table: "programs" | "about_sections", page: "PROGRAM" | "ABOUT") {
  const [rows] = await conn.query<Row[]>(`SELECT * FROM \`${table}\` ORDER BY sort_order, id`);
  console.log(`• ${table}: ${rows.length} rows`);
  for (const r of rows) {
    const legacyId = Number(r.id);
    const tr = variants((s) => {
      const title = str(r[`title${s}`]);
      const html = toHtml(str(r[`description${s}`]));
      return title && html ? { title, contentHtml: html } : null;
    });
    if (!tr.length) {
      bump(table, "skipped");
      continue;
    }
    if (DRY) {
      bump(table, "created");
      continue;
    }
    const where = { legacySource_legacyId: { legacySource: `${SOURCE}.${table}`, legacyId } };
    const existing = await db.pageSection.findUnique({ where });
    // Legacy program icons are emoji; the new site uses Lucide names, so leave unset.
    const data = { page, sortOrder: Number(r.sort_order ?? legacyId), isVisible: true };
    const row = existing
      ? await db.pageSection.update({ where: { id: existing.id }, data })
      : await db.pageSection.create({ data: { ...data, legacySource: `${SOURCE}.${table}`, legacyId } });
    for (const { locale, data: t } of tr) {
      await db.pageSectionTranslation.upsert({
        where: { sectionId_locale: { sectionId: row.id, locale } },
        create: { sectionId: row.id, locale, ...t },
        update: t,
      });
    }
    bump(table, existing ? "updated" : "created");
  }
}

// -----------------------------------------------------------------------------
// Members & contact messages
// -----------------------------------------------------------------------------
async function importMembers(conn: mysql.Connection) {
  const [rows] = await conn.query<Row[]>("SELECT * FROM `members` ORDER BY id");
  console.log(`• members: ${rows.length} rows`);
  if (!rows.length) return;
  const muns = await db.municipality.findMany({ include: { adminPosts: true } });
  const findMun = (name?: string) => {
    const s = slugify(name ?? "");
    return muns.find((m) => m.slug === s || slugify(m.capital ?? "") === s || m.code.toLowerCase() === s);
  };

  for (const r of rows) {
    const legacyId = Number(r.id);
    const where = { legacySource_legacyId: { legacySource: `${SOURCE}.members`, legacyId } };
    if (await db.member.findUnique({ where })) {
      bump("members", "skipped");
      continue;
    }
    const mun = findMun(str(r.municipality));
    const fullName = str(r.full_name);
    const birth = r.birth_date ? new Date(`${String(r.birth_date).slice(0, 10)}T00:00:00Z`) : null;
    const gender = /^f|feto|fem/i.test(str(r.gender) ?? "") ? "FEMALE" : /^m|mane|mas/i.test(str(r.gender) ?? "") ? "MALE" : null;
    if (!mun || !fullName || !birth || Number.isNaN(birth.getTime()) || !gender) {
      warn(`member #${legacyId} (${fullName ?? "?"}) skipped: missing município/name/birth date/gender`);
      bump("members", "skipped");
      continue;
    }
    const post = mun.adminPosts.find((p) => p.slug === slugify(str(r.administrative_post) ?? ""));
    // Personal data: stored in private storage, served only via signed URLs.
    const photoId = await importFile(str(r.photo), `members.${legacyId}`, { kind: "IMAGE", visibility: "PRIVATE" });
    if (DRY) {
      bump("members", "created");
      continue;
    }
    await db.member.create({
      data: {
        registrationRef: `REG-${randomCode(8)}`,
        qrToken: randomToken(32),
        status: "PENDING",
        channel: "LEGACY_MIGRATION",
        fullName,
        gender,
        birthDate: birth,
        phone: str(r.phone) ? normalizePhone(str(r.phone)!) : null,
        email: str(r.email)?.toLowerCase(),
        occupation: str(r.profession),
        municipalityId: mun.id,
        adminPostId: post?.id,
        addressLine: [str(r.suku) && `Suco ${str(r.suku)}`].filter(Boolean).join(", ") || null,
        motivation: str(r.motivation),
        consentVersion: "legacy",
        consentAt: r.created_at ? new Date(String(r.created_at)) : new Date(),
        createdAt: r.created_at ? new Date(String(r.created_at)) : new Date(),
        photoId: photoId && photoId !== "dry-run" ? photoId : undefined,
        legacySource: `${SOURCE}.members`,
        legacyId,
        statusChanges: { create: { toStatus: "PENDING", reason: "Imported from the previous website — re-verify identity and consent" } },
      },
    });
    bump("members", "created");
  }
}

async function importContactMessages(conn: mysql.Connection) {
  const [rows] = await conn.query<Row[]>("SELECT * FROM `contact_messages` ORDER BY id");
  console.log(`• contact_messages: ${rows.length} rows`);
  for (const r of rows) {
    const legacyId = Number(r.id);
    if (DRY) {
      bump("contact_messages", "created");
      continue;
    }
    const where = { legacySource_legacyId: { legacySource: `${SOURCE}.contact_messages`, legacyId } };
    if (await db.contactMessage.findUnique({ where })) {
      bump("contact_messages", "skipped");
      continue;
    }
    await db.contactMessage.create({
      data: {
        name: str(r.name) ?? "—",
        email: str(r.email),
        phone: str(r.phone),
        subject: str(r.subject),
        message: str(r.message) ?? "",
        createdAt: r.created_at ? new Date(String(r.created_at)) : new Date(),
        legacySource: `${SOURCE}.contact_messages`,
        legacyId,
      },
    });
    bump("contact_messages", "created");
  }
}

// -----------------------------------------------------------------------------
async function main() {
  const url = process.env.LEGACY_MYSQL_URL;
  if (!url) throw new Error("LEGACY_MYSQL_URL is not set");
  if (!existsSync(SITE_ROOT)) throw new Error(`LEGACY_SITE_ROOT not found: ${SITE_ROOT}`);
  console.log(`PST legacy import ${DRY ? "(DRY RUN — nothing is written)" : ""}\n  site root: ${SITE_ROOT}`);

  const conn = await mysql.createConnection({ uri: url, charset: "utf8mb4", dateStrings: true });
  try {
    await importPosts(conn, "news");
    await importPosts(conn, "articles");
    await importGallery(conn);
    await importLeadership(conn);
    await importSections(conn, "programs", "PROGRAM");
    await importSections(conn, "about_sections", "ABOUT");
    await importMembers(conn);
    await importContactMessages(conn);
  } finally {
    await conn.end();
  }

  console.log("\nSummary");
  console.table(stats);
  if (warnings.length) console.log(`${warnings.length} warning(s) — see above.`);
  if (!DRY) await audit({ action: "system.legacy_import", actorEmail: "system@migrate-legacy", metadata: { stats, warnings: warnings.length } });
}

main()
  .catch((err) => {
    console.error("Legacy import failed:", err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
