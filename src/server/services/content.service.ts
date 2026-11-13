/**
 * Media library, official documents, leadership and branch offices.
 */
import { db } from "@/lib/db";
import { audit, type AuditActor } from "@/lib/audit";
import { badRequest, conflict, forbidden, notFound } from "@/lib/http";
import type { RequestContext } from "@/lib/request";
import { inScope } from "@/lib/security/rbac";
import type { AuthSession } from "@/lib/security/session";
import { pickTranslation } from "@/lib/i18n/pick";
import { videoProvider } from "@/lib/sanitize";
import { urlFor } from "@/lib/storage";
import { storeUpload } from "@/lib/storage/upload";
import { slugify } from "@/lib/utils/slug";
import type { AppLocale } from "@/lib/validation/common";
import { Prisma, type DocumentType, type LeadershipLevel, type Locale, type MediaKind } from "@/generated/prisma/client";
import type { z } from "zod";
import type {
  branchSchema,
  documentCreateSchema,
  documentUpdateSchema,
  leadershipCreateSchema,
  leadershipUpdateSchema,
} from "@/lib/validation/content";

const actorOf = (a: AuthSession): AuditActor => ({ id: a.user.id, email: a.user.email, role: a.user.role });

// =============================================================================
//  MEDIA
// =============================================================================
const mediaSelect = {
  id: true,
  kind: true,
  visibility: true,
  storageKey: true,
  externalUrl: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  width: true,
  height: true,
  blurDataUrl: true,
  altText: true,
  credit: true,
  createdAt: true,
  uploadedBy: { select: { id: true, name: true } },
} satisfies Prisma.MediaAssetSelect;

type MediaRow = Prisma.MediaAssetGetPayload<{ select: typeof mediaSelect }>;
const mediaDto = (m: MediaRow) => ({ ...m, url: m.storageKey ? urlFor(m.storageKey) : m.externalUrl });

export async function uploadMedia(
  auth: AuthSession,
  file: File,
  meta: { altText?: Record<string, string>; credit?: string },
  ctx: RequestContext,
) {
  const up = await storeUpload(file, { accept: ["IMAGE", "DOCUMENT", "AUDIO", "VIDEO"], visibility: "PUBLIC", folder: "library" });
  const media = await db.mediaAsset.create({
    data: { ...up, kind: up.kind as MediaKind, visibility: "PUBLIC", uploadedById: auth.user.id, altText: meta.altText, credit: meta.credit },
    select: mediaSelect,
  });
  await audit({ action: "media.uploaded", actor: actorOf(auth), entityType: "MediaAsset", entityId: media.id, metadata: { kind: media.kind, size: media.sizeBytes }, ctx });
  return mediaDto(media);
}

export async function addVideoEmbed(auth: AuthSession, url: string, meta: { altText?: Record<string, string>; credit?: string }, ctx: RequestContext) {
  const provider = videoProvider(url);
  if (!provider) throw badRequest("Only https YouTube, Vimeo or Facebook video links are allowed");
  const media = await db.mediaAsset.create({
    data: { kind: "VIDEO_EMBED", visibility: "PUBLIC", externalUrl: url, mimeType: `video/x-${provider}`, uploadedById: auth.user.id, altText: meta.altText, credit: meta.credit },
    select: mediaSelect,
  });
  await audit({ action: "media.embed_added", actor: actorOf(auth), entityType: "MediaAsset", entityId: media.id, metadata: { provider }, ctx });
  return mediaDto(media);
}

export async function listMedia(f: { kind?: MediaKind; q?: string }, skip: number, take: number) {
  const where: Prisma.MediaAssetWhereInput = {
    deletedAt: null,
    visibility: "PUBLIC",
    kind: f.kind,
    ...(f.q ? { OR: [{ originalName: { contains: f.q, mode: "insensitive" } }, { credit: { contains: f.q, mode: "insensitive" } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.mediaAsset.findMany({ where, select: mediaSelect, orderBy: { createdAt: "desc" }, skip, take }),
    db.mediaAsset.count({ where }),
  ]);
  return { items: rows.map(mediaDto), total };
}

export async function updateMedia(auth: AuthSession, id: string, data: { altText?: Record<string, string>; credit?: string | null }, ctx: RequestContext) {
  const m = await db.mediaAsset.findFirst({ where: { id, deletedAt: null, visibility: "PUBLIC" } });
  if (!m) throw notFound("Media");
  const updated = await db.mediaAsset.update({ where: { id }, data: { altText: data.altText, credit: data.credit }, select: mediaSelect });
  await audit({ action: "media.updated", actor: actorOf(auth), entityType: "MediaAsset", entityId: id, ctx });
  return mediaDto(updated);
}

/** Soft delete: hidden from the library; the file is kept on disk (old articles may still embed it). */
export async function deleteMedia(auth: AuthSession, id: string, ctx: RequestContext) {
  const m = await db.mediaAsset.findFirst({ where: { id, deletedAt: null, visibility: "PUBLIC" } });
  if (!m) throw notFound("Media");
  const inUse = await db.post.count({ where: { coverId: id, deletedAt: null } });
  if (inUse) throw conflict(`Media is the cover of ${inUse} post(s)`);
  await db.mediaAsset.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({ action: "media.deleted", actor: actorOf(auth), entityType: "MediaAsset", entityId: id, ctx });
}

// =============================================================================
//  DOCUMENTS
// =============================================================================
type DocCreate = z.infer<typeof documentCreateSchema>;
type DocUpdate = z.infer<typeof documentUpdateSchema>;

async function assertPdf(fileId?: string) {
  if (!fileId) return;
  const f = await db.mediaAsset.findFirst({ where: { id: fileId, deletedAt: null }, select: { kind: true, visibility: true } });
  if (!f || f.kind !== "DOCUMENT" || f.visibility !== "PUBLIC") throw badRequest("fileId must be a public PDF from the media library");
}

async function uniqueDocSlug(base: string, excludeId?: string) {
  const root = slugify(base, 150) || "document";
  for (let i = 1; i < 50; i++) {
    const slug = i === 1 ? root : `${root}-${i}`;
    const clash = await db.document.findFirst({ where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true } });
    if (!clash) return slug;
  }
  throw conflict("Could not generate a unique slug");
}

const docInclude = { translations: { include: { file: { select: { storageKey: true, sizeBytes: true } } } } } satisfies Prisma.DocumentInclude;
type DocRow = Prisma.DocumentGetPayload<{ include: typeof docInclude }>;
const docDto = (d: DocRow) => ({
  ...d,
  translations: d.translations.map((t) => ({ ...t, fileUrl: t.file?.storageKey ? urlFor(t.file.storageKey) : null })),
});

export async function createDocument(auth: AuthSession, input: DocCreate, ctx: RequestContext) {
  for (const t of input.translations) await assertPdf(t.fileId);
  const doc = await db.document.create({
    data: {
      type: input.type,
      slug: await uniqueDocSlug(input.slug ?? input.translations[0]!.title),
      versionLabel: input.versionLabel,
      isPublic: input.isPublic,
      isFeatured: input.isFeatured,
      publishedAt: input.publishedAt ?? new Date(),
      createdById: auth.user.id,
      translations: { create: input.translations },
    },
    include: docInclude,
  });
  await audit({ action: "document.created", actor: actorOf(auth), entityType: "Document", entityId: doc.id, metadata: { type: doc.type }, ctx });
  return docDto(doc);
}

export async function updateDocument(auth: AuthSession, id: string, input: DocUpdate, ctx: RequestContext) {
  const existing = await db.document.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw notFound("Document");
  for (const t of input.translations ?? []) await assertPdf(t.fileId);
  const { translations, removeLocales, slug, ...rest } = input;
  await db.$transaction(async (tx) => {
    if (removeLocales?.length) await tx.documentTranslation.deleteMany({ where: { documentId: id, locale: { in: removeLocales } } });
    for (const t of translations ?? []) {
      await tx.documentTranslation.upsert({
        where: { documentId_locale: { documentId: id, locale: t.locale } },
        create: { ...t, documentId: id },
        update: t,
      });
    }
    await tx.document.update({ where: { id }, data: { ...rest, ...(slug ? { slug: await uniqueDocSlug(slug, id) } : {}) } });
  });
  if (!(await db.documentTranslation.count({ where: { documentId: id } }))) throw badRequest("A document must keep at least one language");
  await audit({ action: "document.updated", actor: actorOf(auth), entityType: "Document", entityId: id, ctx });
  return docDto(await db.document.findUniqueOrThrow({ where: { id }, include: docInclude }));
}

export async function deleteDocument(auth: AuthSession, id: string, ctx: RequestContext) {
  const { count } = await db.document.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date() } });
  if (!count) throw notFound("Document");
  await audit({ action: "document.deleted", severity: "WARNING", actor: actorOf(auth), entityType: "Document", entityId: id, ctx });
}

export async function listDocumentsAdmin(f: { type?: DocumentType }, skip: number, take: number) {
  const where: Prisma.DocumentWhereInput = { deletedAt: null, type: f.type };
  const [rows, total] = await Promise.all([
    db.document.findMany({ where, include: docInclude, orderBy: { publishedAt: "desc" }, skip, take }),
    db.document.count({ where }),
  ]);
  return { items: rows.map(docDto), total };
}

export async function listDocumentsPublic(locale: AppLocale, f: { type?: DocumentType; featured?: boolean }, skip: number, take: number) {
  const where: Prisma.DocumentWhereInput = { deletedAt: null, isPublic: true, publishedAt: { lte: new Date() }, type: f.type, ...(f.featured ? { isFeatured: true } : {}) };
  const [rows, total] = await Promise.all([
    db.document.findMany({ where, include: docInclude, orderBy: [{ isFeatured: "desc" }, { publishedAt: "desc" }], skip, take }),
    db.document.count({ where }),
  ]);
  return {
    items: rows.map((d) => {
      const t = pickTranslation(d.translations, locale);
      return {
        slug: d.slug,
        type: d.type,
        versionLabel: d.versionLabel,
        publishedAt: d.publishedAt,
        downloadCount: d.downloadCount,
        title: t?.title,
        description: t?.description,
        isFallback: t?.isFallback,
        sizeBytes: t?.file?.sizeBytes ?? null,
        downloadUrl: `/api/public/documents/${d.slug}/download?locale=${locale}`,
        languages: d.translations.filter((x) => x.fileId).map((x) => x.locale.toLowerCase()),
      };
    }),
    total,
  };
}

/** Resolves the file for a language (with fallback) and counts the download. */
export async function documentDownloadUrl(slug: string, locale: AppLocale): Promise<string> {
  const d = await db.document.findFirst({ where: { slug, deletedAt: null, isPublic: true }, include: docInclude });
  if (!d) throw notFound("Document");
  const withFile = d.translations.filter((t) => t.file?.storageKey);
  const t = pickTranslation(withFile, locale);
  if (!t?.file?.storageKey) throw notFound("Document file");
  await db.document.update({ where: { id: d.id }, data: { downloadCount: { increment: 1 } } });
  return urlFor(t.file.storageKey);
}

// =============================================================================
//  LEADERSHIP
// =============================================================================
type LeadCreate = z.infer<typeof leadershipCreateSchema>;
type LeadUpdate = z.infer<typeof leadershipUpdateSchema>;

const leadInclude = {
  translations: true,
  photo: { select: { storageKey: true, blurDataUrl: true } },
  municipality: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.LeadershipInclude;
type LeadRow = Prisma.LeadershipGetPayload<{ include: typeof leadInclude }>;
const leadDto = (l: LeadRow) => ({ ...l, photoUrl: l.photo?.storageKey ? urlFor(l.photo.storageKey) : null });

function assertLeadershipScope(auth: AuthSession, level: LeadershipLevel, municipalityId: number | null | undefined) {
  if (level === "MUNICIPAL_COMMITTEE" && !municipalityId) throw badRequest("Municipal committee positions need a município");
  if (!inScope(auth.user, municipalityId)) throw forbidden("Município outside your scope");
}

export async function createLeadership(auth: AuthSession, input: LeadCreate, ctx: RequestContext) {
  assertLeadershipScope(auth, input.level, input.municipalityId);
  const { translations, ...data } = input;
  const row = await db.leadership.create({ data: { ...data, translations: { create: translations } }, include: leadInclude });
  await audit({ action: "leadership.created", actor: actorOf(auth), entityType: "Leadership", entityId: row.id, metadata: { level: row.level }, ctx });
  return leadDto(row);
}

export async function updateLeadership(auth: AuthSession, id: string, input: LeadUpdate, ctx: RequestContext) {
  const existing = await db.leadership.findUnique({ where: { id } });
  if (!existing) throw notFound("Leadership position");
  const { translations, removeLocales, ...data } = input;
  assertLeadershipScope(auth, data.level ?? existing.level, data.municipalityId !== undefined ? data.municipalityId : existing.municipalityId);
  await db.$transaction(async (tx) => {
    if (removeLocales?.length) await tx.leadershipTranslation.deleteMany({ where: { leadershipId: id, locale: { in: removeLocales } } });
    for (const t of translations ?? []) {
      await tx.leadershipTranslation.upsert({
        where: { leadershipId_locale: { leadershipId: id, locale: t.locale } },
        create: { ...t, leadershipId: id },
        update: t,
      });
    }
    await tx.leadership.update({ where: { id }, data });
  });
  await audit({ action: "leadership.updated", actor: actorOf(auth), entityType: "Leadership", entityId: id, ctx });
  return leadDto(await db.leadership.findUniqueOrThrow({ where: { id }, include: leadInclude }));
}

export async function deleteLeadership(auth: AuthSession, id: string, ctx: RequestContext) {
  await db.leadership.delete({ where: { id } });
  await audit({ action: "leadership.deleted", actor: actorOf(auth), entityType: "Leadership", entityId: id, ctx });
}

export async function listLeadership(f: { level?: LeadershipLevel; municipalityId?: number; activeOnly?: boolean }) {
  const rows = await db.leadership.findMany({
    where: { level: f.level, municipalityId: f.municipalityId, ...(f.activeOnly ? { isActive: true } : {}) },
    include: leadInclude,
    orderBy: [{ level: "asc" }, { sortOrder: "asc" }, { fullName: "asc" }],
  });
  return rows.map(leadDto);
}

export function leadershipPublic(rows: ReturnType<typeof leadDto>[], locale: AppLocale) {
  return rows.map((l) => {
    const t = pickTranslation(l.translations, locale);
    return {
      id: l.id,
      level: l.level,
      fullName: l.fullName,
      positionTitle: t?.positionTitle ?? "",
      bio: t?.bio ?? null,
      photoUrl: l.photoUrl,
      blurDataUrl: l.photo?.blurDataUrl ?? null,
      municipality: l.municipality,
      isCoordinator: l.isCoordinator,
    };
  });
}

// =============================================================================
//  BRANCH OFFICES & MUNICIPAL DIRECTORY
// =============================================================================
type BranchInput = z.infer<typeof branchSchema>;

export async function upsertBranch(auth: AuthSession, id: string | null, input: BranchInput, ctx: RequestContext) {
  if (!inScope(auth.user, input.municipalityId)) throw forbidden("Município outside your scope");
  if (input.adminPostId) {
    const p = await db.adminPost.findUnique({ where: { id: input.adminPostId } });
    if (!p || p.municipalityId !== input.municipalityId) throw badRequest("Posto does not belong to the município");
  }
  const data = {
    ...input,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    openingHours: input.openingHours ?? Prisma.DbNull,
  };
  const row = id
    ? await db.branchOffice.update({ where: { id }, data })
    : await db.branchOffice.create({ data });
  await audit({ action: id ? "branch.updated" : "branch.created", actor: actorOf(auth), entityType: "BranchOffice", entityId: row.id, ctx });
  return row;
}

export async function deleteBranch(auth: AuthSession, id: string, ctx: RequestContext) {
  const b = await db.branchOffice.findUnique({ where: { id } });
  if (!b) throw notFound("Branch office");
  if (!inScope(auth.user, b.municipalityId)) throw forbidden();
  await db.branchOffice.delete({ where: { id } });
  await audit({ action: "branch.deleted", actor: actorOf(auth), entityType: "BranchOffice", entityId: id, ctx });
}

/** Public directory: 14 municípios with their offices and coordinators. */
export async function municipalDirectory(locale: AppLocale) {
  const rows = await db.municipality.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      branchOffices: {
        where: { isActive: true },
        orderBy: [{ isHeadquarters: "desc" }, { name: "asc" }],
        include: {
          adminPost: { select: { name: true } },
          coordinator: { include: leadInclude },
        },
      },
      leadership: { where: { isActive: true, level: "MUNICIPAL_COMMITTEE" }, include: leadInclude, orderBy: { sortOrder: "asc" } },
      _count: { select: { adminPosts: true } },
    },
  });
  return rows.map((m) => ({
    code: m.code,
    name: m.name,
    slug: m.slug,
    officialName: m.officialName,
    capital: m.capital,
    isSpecialRegion: m.isSpecialRegion,
    latitude: m.latitude ? Number(m.latitude) : null,
    longitude: m.longitude ? Number(m.longitude) : null,
    adminPostCount: m._count.adminPosts,
    committee: leadershipPublic(m.leadership.map(leadDto), locale),
    offices: m.branchOffices.map((b) => ({
      id: b.id,
      name: b.name,
      adminPost: b.adminPost?.name ?? null,
      address: b.address,
      phone: b.phone,
      email: b.email,
      latitude: b.latitude ? Number(b.latitude) : null,
      longitude: b.longitude ? Number(b.longitude) : null,
      openingHours: (b.openingHours as Record<string, string> | null)?.[locale] ?? null,
      isHeadquarters: b.isHeadquarters,
      coordinator: b.coordinator ? leadershipPublic([leadDto(b.coordinator)], locale)[0] : null,
    })),
  }));
}

export type { Locale };
