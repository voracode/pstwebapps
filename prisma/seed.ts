/**
 * PST database seed — idempotent, safe to re-run.
 *
 *   npx prisma db seed
 *
 * 1. 14 Municípios + Postos Administrativos (reference data, upserted)
 * 2. Optional Sucos/Aldeias from prisma/data/sucos-aldeias.csv
 * 3. Default CMS categories (4 languages)
 * 4. Default site settings (never overwrites values edited in the backoffice)
 * 5. Super Admin admin@pst.tl (SUPER_ADMIN, forced password rotation)
 */
import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Locale, Role, Prisma } from "../src/generated/prisma/client";
import { hashPassword, PASSWORD_MIN_LENGTH } from "../src/lib/security/password";
import { MUNICIPALITIES, slugify } from "./data/geography";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const log = (msg: string) => console.log(`[seed] ${msg}`);

// -----------------------------------------------------------------------------
// 1. Municípios & Postos Administrativos
// -----------------------------------------------------------------------------
async function seedGeography() {
  for (const [index, m] of MUNICIPALITIES.entries()) {
    const data = {
      name: m.name,
      slug: slugify(m.name),
      officialName: m.officialName,
      capital: m.capital,
      isSpecialRegion: m.isSpecialRegion ?? false,
      latitude: new Prisma.Decimal(m.lat),
      longitude: new Prisma.Decimal(m.lng),
      sortOrder: index + 1,
    };

    const municipality = await prisma.municipality.upsert({
      where: { code: m.code },
      create: { code: m.code, ...data },
      update: data,
    });

    for (const [i, postName] of m.adminPosts.entries()) {
      const slug = slugify(postName);
      const code = `${m.code}-${String(i + 1).padStart(2, "0")}`;
      await prisma.adminPost.upsert({
        where: { municipalityId_slug: { municipalityId: municipality.id, slug } },
        create: { municipalityId: municipality.id, name: postName, slug, code },
        update: { name: postName },
      });
    }
  }

  const [mCount, pCount] = await Promise.all([
    prisma.municipality.count(),
    prisma.adminPost.count(),
  ]);
  log(`geography: ${mCount} municípios, ${pCount} postos administrativos`);
}

// -----------------------------------------------------------------------------
// 2. Sucos & Aldeias (optional CSV)
//    Header: municipality_code,admin_post,suco,aldeia
//    One row per aldeia; a row with an empty `aldeia` creates only the suco.
// -----------------------------------------------------------------------------
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

async function seedSucosAndAldeias() {
  // `prisma db seed` always runs from the project root.
  const file = path.resolve(process.cwd(), "prisma", "data", "sucos-aldeias.csv");
  if (!existsSync(file)) {
    log("sucos/aldeias: prisma/data/sucos-aldeias.csv not found — skipped");
    return;
  }

  const lines = readFileSync(file, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines.shift() ?? "").map((h) => h.toLowerCase());
  const col = (name: string) => {
    const idx = header.indexOf(name);
    if (idx === -1) throw new Error(`sucos-aldeias.csv: missing column "${name}"`);
    return idx;
  };
  const cMun = col("municipality_code");
  const cPost = col("admin_post");
  const cSuco = col("suco");
  const cAldeia = col("aldeia");

  const posts = await prisma.adminPost.findMany({ include: { municipality: true } });
  const postIndex = new Map(posts.map((p) => [`${p.municipality.code}|${p.slug}`, p.id]));
  const sucoCache = new Map<string, number>();
  let sucos = 0;
  let aldeias = 0;
  const skipped: string[] = [];

  for (const [n, line] of lines.entries()) {
    const row = parseCsvLine(line);
    const munCode = row[cMun]?.toUpperCase() ?? "";
    const postName = row[cPost] ?? "";
    const sucoName = row[cSuco] ?? "";
    const aldeiaName = row[cAldeia] ?? "";

    const adminPostId = postIndex.get(`${munCode}|${slugify(postName)}`);
    if (!adminPostId || !sucoName) {
      skipped.push(`line ${n + 2}: ${munCode} / ${postName} / ${sucoName}`);
      continue;
    }

    const sucoSlug = slugify(sucoName);
    const sucoKey = `${adminPostId}|${sucoSlug}`;
    let sucoId = sucoCache.get(sucoKey);
    if (!sucoId) {
      const suco = await prisma.suco.upsert({
        where: { adminPostId_slug: { adminPostId, slug: sucoSlug } },
        create: { adminPostId, name: sucoName, slug: sucoSlug },
        update: { name: sucoName },
      });
      sucoId = suco.id;
      sucoCache.set(sucoKey, sucoId);
      sucos++;
    }

    if (aldeiaName) {
      const slug = slugify(aldeiaName);
      await prisma.aldeia.upsert({
        where: { sucoId_slug: { sucoId, slug } },
        create: { sucoId, name: aldeiaName, slug },
        update: { name: aldeiaName },
      });
      aldeias++;
    }
  }

  log(`sucos/aldeias: ${sucos} sucos, ${aldeias} aldeias upserted`);
  if (skipped.length) {
    log(`sucos/aldeias: ${skipped.length} rows skipped (unknown posto or empty suco):`);
    skipped.slice(0, 20).forEach((s) => log(`  - ${s}`));
  }
}

// -----------------------------------------------------------------------------
// 3. CMS categories
// -----------------------------------------------------------------------------
const CATEGORIES: { key: string; names: Record<Locale, string> }[] = [
  {
    key: "party-news",
    names: { TET: "Notísia Partidu", PT: "Notícias do Partido", ID: "Berita Partai", EN: "Party News" },
  },
  {
    key: "press-release",
    names: {
      TET: "Komunikadu ba Imprensa",
      PT: "Comunicados de Imprensa",
      ID: "Siaran Pers",
      EN: "Press Releases",
    },
  },
  {
    key: "opinion",
    names: { TET: "Opiniaun", PT: "Opinião", ID: "Opini", EN: "Opinion" },
  },
  {
    key: "political-education",
    names: {
      TET: "Edukasaun Polítika",
      PT: "Educação Política",
      ID: "Pendidikan Politik",
      EN: "Political Education",
    },
  },
  {
    key: "municipal-news",
    names: {
      TET: "Notísia Munisípiu",
      PT: "Notícias Municipais",
      ID: "Berita Munisipal",
      EN: "Municipal News",
    },
  },
];

async function seedCategories() {
  for (const [i, c] of CATEGORIES.entries()) {
    const category = await prisma.category.upsert({
      where: { key: c.key },
      create: { key: c.key, sortOrder: i + 1 },
      update: {},
    });
    for (const locale of Object.values(Locale)) {
      const name = c.names[locale];
      await prisma.categoryTranslation.upsert({
        where: { categoryId_locale: { categoryId: category.id, locale } },
        create: { categoryId: category.id, locale, name, slug: slugify(name) },
        update: {},
      });
    }
  }
  log(`categories: ${CATEGORIES.length} ensured`);
}

// -----------------------------------------------------------------------------
// 4. Site settings — created once, then owned by the backoffice
// -----------------------------------------------------------------------------
const SITE_SETTINGS: Record<string, Prisma.InputJsonValue> = {
  "site.name": {
    tet: "Partidu Sosialista Timor",
    pt: "Partido Socialista de Timor",
    id: "Partai Sosialis Timor",
    en: "Socialist Party of Timor",
  },
  "site.shortName": "PST",
  // The motto is official in Portuguese and is shown untranslated everywhere.
  "site.motto": "Pelo Progresso, Igualdade",
  "site.defaultLocale": "tet",
  "site.locales": ["tet", "pt", "id", "en"],
  "brand.colors": {
    red: "#D91C1F",
    redAlt: "#DC2626",
    gold: "#FACC15",
    goldAlt: "#F59E0B",
    black: "#0F172A",
    white: "#FFFFFF",
    surface: "#F8FAFC",
  },
  "contact.headquarters": { address: null, phone: null, email: null, whatsapp: null },
  "social.links": { facebook: null, youtube: null, instagram: null, tiktok: null, x: null },
  "membership.consentVersion": "2026-11",
  "membership.minimumAge": 17,
  "membership.requireIdScan": true,
  "kta.validityYears": 5,
  "aspiration.autoAcknowledge": true,
};

async function seedSettings() {
  for (const [key, value] of Object.entries(SITE_SETTINGS)) {
    await prisma.siteSetting.upsert({ where: { key }, create: { key, value }, update: {} });
  }
  log(`site settings: ${Object.keys(SITE_SETTINGS).length} keys ensured`);
}

// -----------------------------------------------------------------------------
// 5. Super Admin
// -----------------------------------------------------------------------------
async function seedSuperAdmin() {
  const email = (process.env.SEED_SUPER_ADMIN_EMAIL ?? "admin@pst.tl").trim().toLowerCase();
  const resetRequested = process.env.SEED_SUPER_ADMIN_RESET === "true";
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing && !resetRequested) {
    log(`super admin: ${email} already exists — password untouched`);
    return;
  }

  let password = process.env.SEED_SUPER_ADMIN_PASSWORD ?? "";
  let generated = false;
  if (!password) {
    password = randomBytes(18).toString("base64url"); // 24 chars, ~144 bits
    generated = true;
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`SEED_SUPER_ADMIN_PASSWORD must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }

  const passwordHash = await hashPassword(password);
  const credentials = {
    passwordHash,
    mustChangePassword: true, // forced rotation at first login
    passwordChangedAt: null,
    failedLoginCount: 0,
    lockedUntil: null,
    status: "ACTIVE" as const,
  };

  await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: "PST Super Admin",
      role: Role.SUPER_ADMIN,
      preferredLocale: Locale.TET,
      ...credentials,
    },
    update: credentials,
  });

  log(`super admin: ${email} ${existing ? "password reset" : "created"} (must change password on first login)`);

  if (generated) {
    const bar = "=".repeat(64);
    console.log(
      [
        "",
        bar,
        "  ONE-TIME SUPER ADMIN PASSWORD — store it now, it is not saved anywhere",
        `  email   : ${email}`,
        `  password: ${password}`,
        "  You will be forced to change it at first login.",
        bar,
        "",
      ].join("\n"),
    );
  }
}

// -----------------------------------------------------------------------------
async function main() {
  const started = Date.now();
  await seedGeography();
  await seedSucosAndAldeias();
  await seedCategories();
  await seedSettings();
  await seedSuperAdmin();
  log(`done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main()
  .catch((err) => {
    console.error("[seed] failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
