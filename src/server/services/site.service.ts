/**
 * Website content edited in the backoffice: page sections (About, History,
 * Ideology, Program), hero slides, photo albums and site settings.
 */
import { db } from "@/lib/db";
import { audit, type AuditActor } from "@/lib/audit";
import { ApiError, badRequest, conflict, forbidden, notFound } from "@/lib/http";
import type { RequestContext } from "@/lib/request";
import { can } from "@/lib/security/rbac";
import type { AuthSession } from "@/lib/security/session";
import { invalidateSetting } from "@/lib/settings";
import { sanitizeRichText } from "@/lib/sanitize";
import { urlFor } from "@/lib/storage";
import { slugify } from "@/lib/utils/slug";
import {
  SENSITIVE_SETTING_KEYS,
  SETTING_KEYS,
  SETTING_SCHEMAS,
  type AlbumCreateInput,
  type AlbumUpdateInput,
  type HeroCreateInput,
  type HeroUpdateInput,
  type SectionCreateInput,
  type SectionUpdateInput,
  type SettingKey,
} from "@/lib/validation/site";
import type { PageKey, Prisma } from "@/generated/prisma/client";

const actorOf = (a: AuthSession): AuditActor => ({ id: a.user.id, email: a.user.email, role: a.user.role });

async function assertPublicImage(id: string | null | undefined, what = "Image") {
  if (!id) return;
  const m = await db.mediaAsset.findFirst({ where: { id, deletedAt: null }, select: { kind: true, visibility: true } });
  if (!m || m.kind !== "IMAGE" || m.visibility !== "PUBLIC") throw badRequest(`${what} must be a public image from the media library`);
}

const imageSelect = { id: true, storageKey: true, blurDataUrl: true, width: true, height: true, altText: true } satisfies Prisma.MediaAssetSelect;
type ImageRow = Prisma.MediaAssetGetPayload<{ select: typeof imageSelect }>;
const imageDto = (m: ImageRow | null) => (m?.storageKey ? { ...m, url: urlFor(m.storageKey) } : null);

/** Fails when an update would leave the entity with no translation at all. */
function assertKeepsOneLanguage(
  existing: { locale: string }[],
  incoming: { locale: string }[] | undefined,
  removeLocales: string[] | undefined,
) {
  const kept = new Set(existing.map((t) => t.locale).filter((l) => !removeLocales?.includes(l)));
  for (const t of incoming ?? []) kept.add(t.locale);
  if (kept.size < 1) throw badRequest("At least one language must remain");
}

// =============================================================================
//  PAGE SECTIONS
// =============================================================================
const sectionInclude = { translations: { orderBy: { locale: "asc" } } } satisfies Prisma.PageSectionInclude;

function sectionTranslationData(t: NonNullable<SectionCreateInput["translations"]>[number]) {
  return {
    locale: t.locale,
    title: t.title,
    contentHtml: t.contentHtml ? sanitizeRichText(t.contentHtml) : "",
    contentJson: (t.contentJson ?? undefined) as Prisma.InputJsonValue | undefined,
  };
}

export async function listSections(page?: PageKey) {
  return db.pageSection.findMany({
    where: { page },
    include: sectionInclude,
    orderBy: [{ page: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function getSection(id: string) {
  const s = await db.pageSection.findUnique({ where: { id }, include: sectionInclude });
  if (!s) throw notFound("Page section");
  return s;
}

export async function createSection(auth: AuthSession, input: SectionCreateInput, ctx: RequestContext) {
  let sortOrder = input.sortOrder;
  if (sortOrder === undefined) {
    const last = await db.pageSection.findFirst({ where: { page: input.page }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
    sortOrder = last ? last.sortOrder + 1 : 0;
  }
  const row = await db.pageSection.create({
    data: {
      page: input.page,
      icon: input.icon ?? null,
      sortOrder,
      isVisible: input.isVisible,
      translations: { create: input.translations.map(sectionTranslationData) },
    },
    include: sectionInclude,
  });
  await audit({ action: "site.section_created", actor: actorOf(auth), entityType: "PageSection", entityId: row.id, metadata: { page: row.page }, ctx });
  return row;
}

export async function updateSection(auth: AuthSession, id: string, input: SectionUpdateInput, ctx: RequestContext) {
  const existing = await db.pageSection.findUnique({ where: { id }, include: { translations: { select: { locale: true } } } });
  if (!existing) throw notFound("Page section");
  assertKeepsOneLanguage(existing.translations, input.translations, input.removeLocales);

  await db.$transaction(async (tx) => {
    if (input.removeLocales?.length) {
      await tx.pageSectionTranslation.deleteMany({ where: { sectionId: id, locale: { in: input.removeLocales } } });
    }
    for (const t of input.translations ?? []) {
      const data = sectionTranslationData(t);
      await tx.pageSectionTranslation.upsert({
        where: { sectionId_locale: { sectionId: id, locale: t.locale } },
        create: { ...data, sectionId: id },
        update: data,
      });
    }
    await tx.pageSection.update({
      where: { id },
      data: { icon: input.icon, sortOrder: input.sortOrder, isVisible: input.isVisible },
    });
  });
  await audit({
    action: "site.section_updated",
    actor: actorOf(auth),
    entityType: "PageSection",
    entityId: id,
    metadata: { page: existing.page, fields: Object.keys(input) },
    ctx,
  });
  return getSection(id);
}

export async function deleteSection(auth: AuthSession, id: string, ctx: RequestContext) {
  const existing = await db.pageSection.findUnique({ where: { id }, select: { page: true } });
  if (!existing) throw notFound("Page section");
  await db.pageSection.delete({ where: { id } });
  await audit({ action: "site.section_deleted", severity: "WARNING", actor: actorOf(auth), entityType: "PageSection", entityId: id, metadata: { page: existing.page }, ctx });
}

/** Sets sortOrder = position for the given ids, which must all belong to the same page. */
export async function reorderSections(auth: AuthSession, ids: string[], ctx: RequestContext) {
  const rows = await db.pageSection.findMany({ where: { id: { in: ids } }, select: { id: true, page: true } });
  if (rows.length !== ids.length) throw badRequest("Unknown section id");
  const pages = new Set(rows.map((r) => r.page));
  if (pages.size !== 1) throw badRequest("Sections must belong to the same page");
  await db.$transaction(ids.map((id, i) => db.pageSection.update({ where: { id }, data: { sortOrder: i } })));
  const page = rows[0]!.page;
  await audit({ action: "site.sections_reordered", actor: actorOf(auth), entityType: "PageSection", metadata: { page, count: ids.length }, ctx });
  return listSections(page);
}

// =============================================================================
//  HERO SLIDES
// =============================================================================
const heroInclude = { translations: { orderBy: { locale: "asc" } }, image: { select: imageSelect } } satisfies Prisma.HeroSlideInclude;
type HeroRow = Prisma.HeroSlideGetPayload<{ include: typeof heroInclude }>;
const heroDto = (h: HeroRow) => ({ ...h, image: imageDto(h.image) });

function heroTranslationData(t: NonNullable<HeroCreateInput["translations"]>[number]) {
  return { locale: t.locale, headline: t.headline, subline: t.subline ?? null, ctaLabel: t.ctaLabel ?? null };
}

export async function listHeroSlides() {
  const rows = await db.heroSlide.findMany({ include: heroInclude, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  return rows.map(heroDto);
}

async function getHeroSlide(id: string) {
  const h = await db.heroSlide.findUnique({ where: { id }, include: heroInclude });
  if (!h) throw notFound("Hero slide");
  return heroDto(h);
}

export async function createHeroSlide(auth: AuthSession, input: HeroCreateInput, ctx: RequestContext) {
  await assertPublicImage(input.imageId);
  let sortOrder = input.sortOrder;
  if (sortOrder === undefined) {
    const last = await db.heroSlide.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
    sortOrder = last ? last.sortOrder + 1 : 0;
  }
  const row = await db.heroSlide.create({
    data: {
      imageId: input.imageId ?? null,
      ctaHref: input.ctaHref ?? null,
      sortOrder,
      isActive: input.isActive ?? true,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      translations: { create: input.translations.map(heroTranslationData) },
    },
    include: heroInclude,
  });
  await audit({ action: "site.hero_created", actor: actorOf(auth), entityType: "HeroSlide", entityId: row.id, ctx });
  return heroDto(row);
}

export async function updateHeroSlide(auth: AuthSession, id: string, input: HeroUpdateInput, ctx: RequestContext) {
  const existing = await db.heroSlide.findUnique({ where: { id }, include: { translations: { select: { locale: true } } } });
  if (!existing) throw notFound("Hero slide");
  await assertPublicImage(input.imageId);
  assertKeepsOneLanguage(existing.translations, input.translations, input.removeLocales);

  const startsAt = input.startsAt !== undefined ? input.startsAt : existing.startsAt;
  const endsAt = input.endsAt !== undefined ? input.endsAt : existing.endsAt;
  if (startsAt && endsAt && endsAt <= startsAt) throw badRequest("End must be after start", { field: "endsAt" });

  await db.$transaction(async (tx) => {
    if (input.removeLocales?.length) {
      await tx.heroSlideTranslation.deleteMany({ where: { slideId: id, locale: { in: input.removeLocales } } });
    }
    for (const t of input.translations ?? []) {
      const data = heroTranslationData(t);
      await tx.heroSlideTranslation.upsert({
        where: { slideId_locale: { slideId: id, locale: t.locale } },
        create: { ...data, slideId: id },
        update: data,
      });
    }
    await tx.heroSlide.update({
      where: { id },
      data: {
        imageId: input.imageId,
        ctaHref: input.ctaHref,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
      },
    });
  });
  await audit({ action: "site.hero_updated", actor: actorOf(auth), entityType: "HeroSlide", entityId: id, metadata: { fields: Object.keys(input) }, ctx });
  return getHeroSlide(id);
}

export async function deleteHeroSlide(auth: AuthSession, id: string, ctx: RequestContext) {
  const { count } = await db.heroSlide.deleteMany({ where: { id } });
  if (!count) throw notFound("Hero slide");
  await audit({ action: "site.hero_deleted", severity: "WARNING", actor: actorOf(auth), entityType: "HeroSlide", entityId: id, ctx });
}

export async function reorderHeroSlides(auth: AuthSession, ids: string[], ctx: RequestContext) {
  const count = await db.heroSlide.count({ where: { id: { in: ids } } });
  if (count !== ids.length) throw badRequest("Unknown slide id");
  await db.$transaction(ids.map((id, i) => db.heroSlide.update({ where: { id }, data: { sortOrder: i } })));
  await audit({ action: "site.hero_reordered", actor: actorOf(auth), entityType: "HeroSlide", metadata: { count: ids.length }, ctx });
  return listHeroSlides();
}

// =============================================================================
//  ALBUMS (photo gallery)
// =============================================================================
const albumListInclude = {
  translations: { orderBy: { locale: "asc" } },
  cover: { select: imageSelect },
  _count: { select: { items: true } },
} satisfies Prisma.AlbumInclude;
type AlbumListRow = Prisma.AlbumGetPayload<{ include: typeof albumListInclude }>;
const albumListDto = (a: AlbumListRow) => ({ ...a, cover: imageDto(a.cover) });

const albumItemInclude = {
  media: { select: { ...imageSelect, kind: true, externalUrl: true, originalName: true } },
} satisfies Prisma.AlbumItemInclude;

async function uniqueAlbumSlug(base: string, excludeId?: string) {
  const root = slugify(base, 150) || "album";
  for (let i = 1; i < 50; i++) {
    const slug = i === 1 ? root : `${root}-${i}`;
    const clash = await db.album.findFirst({ where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true } });
    if (!clash) return slug;
  }
  throw conflict("Could not generate a unique slug");
}

export async function listAlbums(skip: number, take: number) {
  const [rows, total] = await Promise.all([
    db.album.findMany({ include: albumListInclude, orderBy: [{ updatedAt: "desc" }], skip, take }),
    db.album.count(),
  ]);
  return { items: rows.map(albumListDto), total };
}

export async function getAlbum(id: string) {
  const a = await db.album.findUnique({
    where: { id },
    include: { ...albumListInclude, items: { include: albumItemInclude, orderBy: { sortOrder: "asc" } } },
  });
  if (!a) throw notFound("Album");
  return {
    ...albumListDto(a),
    items: a.items.map((it) => ({
      mediaId: it.mediaId,
      sortOrder: it.sortOrder,
      caption: (it.caption ?? null) as Record<string, string> | null,
      media: {
        id: it.media.id,
        kind: it.media.kind,
        originalName: it.media.originalName,
        altText: it.media.altText,
        blurDataUrl: it.media.blurDataUrl,
        url: it.media.storageKey ? urlFor(it.media.storageKey) : it.media.externalUrl,
      },
    })),
  };
}

export async function createAlbum(auth: AuthSession, input: AlbumCreateInput, ctx: RequestContext) {
  await assertPublicImage(input.coverId, "Cover");
  const row = await db.album.create({
    data: {
      slug: await uniqueAlbumSlug(input.slug ?? input.translations[0]!.title),
      coverId: input.coverId,
      translations: { create: input.translations.map((t) => ({ locale: t.locale, title: t.title, description: t.description ?? null })) },
    },
    include: albumListInclude,
  });
  await audit({ action: "album.created", actor: actorOf(auth), entityType: "Album", entityId: row.id, ctx });
  return albumListDto(row);
}

export async function updateAlbum(auth: AuthSession, id: string, input: AlbumUpdateInput, ctx: RequestContext) {
  const existing = await db.album.findUnique({ where: { id }, include: { translations: { select: { locale: true } } } });
  if (!existing) throw notFound("Album");
  if (input.status && input.status !== existing.status && !can(auth.user.role, "post:publish")) throw forbidden("Not allowed to publish");
  await assertPublicImage(input.coverId, "Cover");
  assertKeepsOneLanguage(existing.translations, input.translations, input.removeLocales);

  const publishing = input.status === "PUBLISHED" && existing.status !== "PUBLISHED";
  await db.$transaction(async (tx) => {
    if (input.removeLocales?.length) await tx.albumTranslation.deleteMany({ where: { albumId: id, locale: { in: input.removeLocales } } });
    for (const t of input.translations ?? []) {
      const data = { locale: t.locale, title: t.title, description: t.description ?? null };
      await tx.albumTranslation.upsert({
        where: { albumId_locale: { albumId: id, locale: t.locale } },
        create: { ...data, albumId: id },
        update: data,
      });
    }
    await tx.album.update({
      where: { id },
      data: {
        coverId: input.coverId,
        status: input.status,
        ...(publishing ? { publishedAt: existing.publishedAt ?? new Date() } : {}),
        ...(input.slug && input.slug !== existing.slug ? { slug: await uniqueAlbumSlug(input.slug, id) } : {}),
      },
    });
  });
  await audit({
    action: publishing ? "album.published" : "album.updated",
    actor: actorOf(auth),
    entityType: "Album",
    entityId: id,
    metadata: { fields: Object.keys(input), status: input.status },
    ctx,
  });
  return getAlbum(id);
}

/** Replaces the album's items (order = array order). Only public images and video embeds are allowed. */
export async function setAlbumItems(
  auth: AuthSession,
  id: string,
  items: { mediaId: string; caption?: Record<string, string> }[],
  ctx: RequestContext,
) {
  const album = await db.album.findUnique({ where: { id }, select: { id: true } });
  if (!album) throw notFound("Album");
  if (items.length) {
    const valid = await db.mediaAsset.count({
      where: { id: { in: items.map((i) => i.mediaId) }, deletedAt: null, visibility: "PUBLIC", kind: { in: ["IMAGE", "VIDEO_EMBED", "VIDEO"] } },
    });
    if (valid !== items.length) throw badRequest("Albums may only contain public images and videos from the media library");
  }
  await db.$transaction([
    db.albumItem.deleteMany({ where: { albumId: id } }),
    db.albumItem.createMany({
      data: items.map((it, i) => ({
        albumId: id,
        mediaId: it.mediaId,
        sortOrder: i,
        caption: it.caption && Object.values(it.caption).some(Boolean) ? (it.caption as Prisma.InputJsonValue) : undefined,
      })),
    }),
    db.album.update({ where: { id }, data: { updatedAt: new Date() } }),
  ]);
  await audit({ action: "album.items_updated", actor: actorOf(auth), entityType: "Album", entityId: id, metadata: { count: items.length }, ctx });
  return getAlbum(id);
}

export async function deleteAlbum(auth: AuthSession, id: string, ctx: RequestContext) {
  const { count } = await db.album.deleteMany({ where: { id } });
  if (!count) throw notFound("Album");
  await audit({ action: "album.deleted", severity: "WARNING", actor: actorOf(auth), entityType: "Album", entityId: id, ctx });
}

// =============================================================================
//  SITE SETTINGS
// =============================================================================
export async function listEditableSettings() {
  const rows = await db.siteSetting.findMany({
    where: { key: { in: SETTING_KEYS } },
    select: { key: true, value: true, updatedAt: true, updatedBy: { select: { id: true, name: true } } },
  });
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return SETTING_KEYS.map((key) => {
    const r = byKey.get(key);
    return { key, value: r?.value ?? null, updatedAt: r?.updatedAt ?? null, updatedBy: r?.updatedBy ?? null };
  });
}

/** Validates each value against its schema, then writes all of them atomically. */
export async function updateSettings(auth: AuthSession, values: Record<string, unknown>, ctx: RequestContext) {
  const parsed: [SettingKey, Prisma.InputJsonValue][] = [];
  const issues: { path: string; message: string; code: string }[] = [];
  for (const [key, raw] of Object.entries(values)) {
    const schema = SETTING_SCHEMAS[key as SettingKey];
    if (!schema) throw badRequest(`Unknown or read-only setting: ${key}`);
    const r = schema.safeParse(raw);
    if (!r.success) {
      for (const i of r.error.issues) issues.push({ path: ["values", key, ...i.path].join("."), message: i.message, code: i.code });
    } else parsed.push([key as SettingKey, r.data as Prisma.InputJsonValue]);
  }
  if (issues.length) throw new ApiError(422, "VALIDATION_ERROR", "Invalid input", issues);

  const before = await db.siteSetting.findMany({ where: { key: { in: parsed.map(([k]) => k) } }, select: { key: true, value: true } });
  const prev = new Map(before.map((b) => [b.key, JSON.stringify(b.value)]));
  const changed = parsed.filter(([k, v]) => prev.get(k) !== JSON.stringify(v));

  if (changed.length) {
    await db.$transaction(
      changed.map(([key, value]) =>
        db.siteSetting.upsert({
          where: { key },
          create: { key, value, updatedById: auth.user.id },
          update: { value, updatedById: auth.user.id },
        }),
      ),
    );
    for (const [key] of changed) invalidateSetting(key);
    const sensitive = changed.some(([k]) => SENSITIVE_SETTING_KEYS.includes(k));
    await audit({
      action: "settings.updated",
      severity: sensitive ? "WARNING" : "INFO",
      actor: actorOf(auth),
      entityType: "SiteSetting",
      metadata: {
        keys: changed.map(([k]) => k),
        changes: Object.fromEntries(changed.map(([k, v]) => [k, { from: before.find((b) => b.key === k)?.value ?? null, to: v }])),
      },
      ctx,
    });
  }
  return listEditableSettings();
}
