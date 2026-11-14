import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { env } from "@/env";
import { audit, type AuditActor } from "@/lib/audit";
import { ApiError, badRequest, forbidden, notFound } from "@/lib/http";
import type { RequestContext } from "@/lib/request";
import { blindIndex } from "@/lib/security/crypto";
import { can } from "@/lib/security/rbac";
import type { AuthSession } from "@/lib/security/session";
import { readingMinutes, sanitizeRichText } from "@/lib/sanitize";
import { pickTranslation } from "@/lib/i18n/pick";
import { urlFor } from "@/lib/storage";
import { slugify } from "@/lib/utils/slug";
import { localeToEnum, type AppLocale } from "@/lib/validation/common";
import type { PostCreateInput, PostUpdateInput } from "@/lib/validation/content";
import { Prisma, type Locale, type PostType, type PublishStatus } from "@/generated/prisma/client";

const actorOf = (a: AuthSession): AuditActor => ({ id: a.user.id, email: a.user.email, role: a.user.role });

type TranslationInput = PostCreateInput["translations"][number];

/** Unique slug per locale: "titulu" → "titulu-2" if taken by another post. */
async function uniqueSlug(locale: Locale, base: string, excludePostId?: string): Promise<string> {
  const root = slugify(base, 200) || "post";
  for (let i = 1; i < 50; i++) {
    const candidate = i === 1 ? root : `${root}-${i}`;
    const clash = await db.postTranslation.findFirst({
      where: { locale, slug: candidate, ...(excludePostId ? { postId: { not: excludePostId } } : {}) },
      select: { id: true },
    });
    if (!clash) return candidate;
  }
  throw new ApiError(409, "SLUG_TAKEN", "Could not generate a unique slug");
}

async function translationData(t: TranslationInput, excludePostId?: string) {
  const html = t.contentHtml ? sanitizeRichText(t.contentHtml) : undefined;
  return {
    locale: t.locale,
    title: t.title,
    slug: await uniqueSlug(t.locale, t.slug ?? t.title, excludePostId),
    // Translations are always sent whole, so an absent optional field means "cleared".
    excerpt: t.excerpt ?? null,
    contentJson: (t.contentJson ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull,
    contentHtml: html ?? null,
    seoTitle: t.seoTitle ?? null,
    seoDescription: t.seoDescription ?? null,
    readingMinutes: html ? readingMinutes(html) : null,
  };
}

async function assertMedia(id: string | null | undefined, kinds: ("IMAGE" | "DOCUMENT")[]) {
  if (!id) return;
  const m = await db.mediaAsset.findFirst({ where: { id, deletedAt: null }, select: { kind: true, visibility: true } });
  if (!m || !kinds.includes(m.kind as "IMAGE" | "DOCUMENT") || m.visibility !== "PUBLIC") {
    throw badRequest("Cover must be a public image from the media library");
  }
}

function tagConnect(tags: string[]) {
  return tags.map((label) => {
    const slug = slugify(label, 80);
    return { where: { slug }, create: { slug, label } };
  });
}

const adminInclude = {
  translations: true,
  category: { include: { translations: true } },
  cover: { select: { id: true, storageKey: true, blurDataUrl: true, width: true, height: true } },
  author: { select: { id: true, name: true } },
  reviewedBy: { select: { id: true, name: true } },
  tags: { select: { slug: true, label: true } },
  attachment: { select: { id: true, slug: true, type: true } },
} satisfies Prisma.PostInclude;

type AdminPost = Prisma.PostGetPayload<{ include: typeof adminInclude }>;

function toAdminDto(p: AdminPost) {
  return {
    ...p,
    cover: p.cover?.storageKey ? { ...p.cover, url: urlFor(p.cover.storageKey) } : null,
    translations: p.translations.map(({ contentJson: _j, ...t }) => t),
  };
}

// -----------------------------------------------------------------------------
// Backoffice
// -----------------------------------------------------------------------------
export async function listPostsAdmin(
  f: { type?: PostType; status?: PublishStatus; categoryId?: string; q?: string },
  skip: number,
  take: number,
) {
  const where: Prisma.PostWhereInput = {
    deletedAt: null,
    type: f.type,
    status: f.status,
    categoryId: f.categoryId,
    ...(f.q ? { translations: { some: { title: { contains: f.q, mode: "insensitive" } } } } : {}),
  };
  const [items, total] = await Promise.all([
    db.post.findMany({ where, include: adminInclude, orderBy: [{ updatedAt: "desc" }], skip, take }),
    db.post.count({ where }),
  ]);
  return { items: items.map(toAdminDto), total };
}

export async function getPostAdmin(id: string) {
  const p = await db.post.findFirst({ where: { id, deletedAt: null }, include: adminInclude });
  if (!p) throw notFound("Post");
  // Editor needs the TipTap JSON back.
  return { ...toAdminDto(p), translations: p.translations };
}

export async function createPost(auth: AuthSession, input: PostCreateInput, ctx: RequestContext) {
  await assertMedia(input.coverId, ["IMAGE"]);
  const translations = [];
  for (const t of input.translations) translations.push(await translationData(t));

  const post = await db.post.create({
    data: {
      type: input.type,
      categoryId: input.categoryId,
      municipalityId: input.municipalityId,
      coverId: input.coverId,
      attachmentId: input.attachmentId,
      byline: input.byline,
      isFeatured: input.isFeatured,
      pinnedToHero: input.pinnedToHero,
      publishedAt: input.publishedAt ?? null,
      authorId: auth.user.id,
      translations: { create: translations },
      tags: { connectOrCreate: tagConnect(input.tags) },
    },
    include: adminInclude,
  });
  await audit({ action: "post.created", actor: actorOf(auth), entityType: "Post", entityId: post.id, metadata: { type: post.type }, ctx });
  return toAdminDto(post);
}

export async function updatePost(auth: AuthSession, id: string, input: PostUpdateInput, ctx: RequestContext) {
  const existing = await db.post.findFirst({ where: { id, deletedAt: null }, include: { translations: true } });
  if (!existing) throw notFound("Post");
  await assertMedia(input.coverId, ["IMAGE"]);

  const remaining = existing.translations.filter((t) => !input.removeLocales?.includes(t.locale)).length +
    (input.translations ?? []).filter((t) => !existing.translations.some((e) => e.locale === t.locale)).length;
  if (remaining < 1) throw badRequest("A post must keep at least one language");
  const dateData = publicationDateChange(auth, existing, input.publishedAt);

  await db.$transaction(async (tx) => {
    if (input.removeLocales?.length) {
      await tx.postTranslation.deleteMany({ where: { postId: id, locale: { in: input.removeLocales } } });
    }
    for (const t of input.translations ?? []) {
      const data = await translationData(t, id);
      await tx.postTranslation.upsert({
        where: { postId_locale: { postId: id, locale: t.locale } },
        create: { ...data, postId: id },
        update: data,
      });
    }
    await tx.post.update({
      where: { id },
      data: {
        type: input.type,
        categoryId: input.categoryId,
        municipalityId: input.municipalityId,
        coverId: input.coverId,
        attachmentId: input.attachmentId,
        byline: input.byline,
        isFeatured: input.isFeatured,
        pinnedToHero: input.pinnedToHero,
        ...dateData,
        ...(input.tags ? { tags: { set: [], connectOrCreate: tagConnect(input.tags) } } : {}),
      },
    });
  });

  await audit({ action: "post.updated", actor: actorOf(auth), entityType: "Post", entityId: id, metadata: { fields: Object.keys(input), ...(Object.keys(dateData).length ? { publication: dateData } : {}) }, ctx });
  return getPostAdmin(id);
}

/**
 * Publication date chosen in the editor (WordPress-style "Publish immediately
 * / on <date>"). `publishedAt` doubles as the planned date while a post is a
 * draft; null means "immediately".
 *  - draft / in review / archived: stored as the planned date.
 *  - published: a past date re-dates the post (lists are ordered by it); a
 *    future date takes it off the site and schedules it for that moment.
 *  - scheduled: moves the schedule.
 * Changing the date of a live or scheduled post needs publish rights.
 */
function publicationDateChange(
  auth: AuthSession,
  post: { status: PublishStatus; publishedAt: Date | null; scheduledAt: Date | null },
  date: Date | null | undefined,
): { status?: PublishStatus; scheduledAt?: Date; publishedAt?: Date | null } {
  if (date === undefined) return {};
  const current = post.status === "SCHEDULED" ? post.scheduledAt : post.publishedAt;
  if ((current?.getTime() ?? null) === (date?.getTime() ?? null)) return {};
  if (date && Number.isNaN(date.getTime())) throw badRequest("Invalid publication date");

  const live = post.status === "PUBLISHED" || post.status === "SCHEDULED";
  if (live && !can(auth.user.role, "post:publish")) throw forbidden("Not allowed to change the publication date");

  if (post.status === "PUBLISHED") {
    if (!date) throw badRequest("A published post needs a publication date");
    return date > new Date() ? { status: "SCHEDULED", scheduledAt: date, publishedAt: date } : { publishedAt: date };
  }
  if (post.status === "SCHEDULED") {
    if (!date) throw badRequest("Choose a date, or use Publish now");
    // A past date is picked up by the worker on its next run (within a minute).
    return { scheduledAt: date, publishedAt: date };
  }
  return { publishedAt: date };
}

const WORKFLOW_AUDIT_ACTION = {
  submit_review: "post.submitted",
  publish: "post.published",
  schedule: "post.scheduled",
  unpublish: "post.unpublished",
  archive: "post.archived",
} as const;

export async function postWorkflow(
  auth: AuthSession,
  id: string,
  action: { action: "submit_review" | "publish" | "unpublish" | "archive" } | { action: "schedule"; scheduledAt: Date },
  ctx: RequestContext,
) {
  const post = await db.post.findFirst({ where: { id, deletedAt: null }, include: { translations: { select: { contentHtml: true } } } });
  if (!post) throw notFound("Post");

  let data: Prisma.PostUpdateInput;
  let scheduledFor: Date | null = null;
  switch (action.action) {
    case "submit_review":
      data = { status: "IN_REVIEW" };
      break;
    case "publish":
      if (!post.translations.some((t) => t.contentHtml)) throw badRequest("Add content before publishing");
      if (post.status !== "SCHEDULED" && post.publishedAt && post.publishedAt > new Date()) {
        // The author chose a future date: publishing means scheduling it.
        data = { status: "SCHEDULED", scheduledAt: post.publishedAt, reviewedBy: { connect: { id: auth.user.id } } };
        scheduledFor = post.publishedAt;
        break;
      }
      // "Publish now" on a scheduled post uses the current time; otherwise the
      // chosen (past) date, or now when none was chosen.
      data = {
        status: "PUBLISHED",
        publishedAt: post.status === "SCHEDULED" || !post.publishedAt || post.publishedAt > new Date() ? new Date() : post.publishedAt,
        scheduledAt: null,
        reviewedBy: { connect: { id: auth.user.id } },
      };
      break;
    case "schedule":
      if (action.scheduledAt <= new Date()) throw badRequest("scheduledAt must be in the future");
      data = { status: "SCHEDULED", scheduledAt: action.scheduledAt, publishedAt: action.scheduledAt, reviewedBy: { connect: { id: auth.user.id } } };
      scheduledFor = action.scheduledAt;
      break;
    case "unpublish":
      data = { status: "DRAFT", scheduledAt: null };
      break;
    case "archive":
      data = { status: "ARCHIVED", pinnedToHero: false, isFeatured: false };
      break;
  }
  await db.post.update({ where: { id }, data });
  await audit({
    action: scheduledFor ? WORKFLOW_AUDIT_ACTION.schedule : WORKFLOW_AUDIT_ACTION[action.action],
    actor: actorOf(auth),
    entityType: "Post",
    entityId: id,
    metadata: scheduledFor ? { scheduledAt: scheduledFor } : undefined,
    ctx,
  });
  return getPostAdmin(id);
}

export async function deletePost(auth: AuthSession, id: string, ctx: RequestContext) {
  const { count } = await db.post.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date(), pinnedToHero: false } });
  if (!count) throw notFound("Post");
  await audit({ action: "post.deleted", severity: "WARNING", actor: actorOf(auth), entityType: "Post", entityId: id, ctx });
}

// -----------------------------------------------------------------------------
// Public
// -----------------------------------------------------------------------------
const publicWhere = (): Prisma.PostWhereInput => ({ deletedAt: null, status: "PUBLISHED", publishedAt: { lte: new Date() } });

const publicInclude = {
  translations: { select: { locale: true, title: true, slug: true, excerpt: true, readingMinutes: true } },
  category: { select: { key: true, translations: { select: { locale: true, name: true, slug: true } } } },
  cover: { select: { storageKey: true, blurDataUrl: true, width: true, height: true, altText: true } },
  municipality: { select: { name: true, slug: true } },
} satisfies Prisma.PostInclude;

type PublicPostRow = Prisma.PostGetPayload<{ include: typeof publicInclude }>;

function toPublicCard(p: PublicPostRow, locale: AppLocale) {
  const t = pickTranslation(p.translations, locale);
  const c = p.category ? pickTranslation(p.category.translations, locale) : null;
  return {
    id: p.id,
    type: p.type,
    locale: t?.locale.toLowerCase(),
    isFallback: t?.isFallback ?? false,
    title: t?.title ?? "",
    slug: t?.slug ?? "",
    excerpt: t?.excerpt ?? null,
    readingMinutes: t?.readingMinutes ?? null,
    category: c ? { key: p.category!.key, name: c.name, slug: c.slug } : null,
    municipality: p.municipality,
    byline: p.byline,
    isFeatured: p.isFeatured,
    publishedAt: p.publishedAt,
    cover: p.cover?.storageKey ? { url: urlFor(p.cover.storageKey), blurDataUrl: p.cover.blurDataUrl, width: p.cover.width, height: p.cover.height, alt: p.cover.altText } : null,
  };
}

export async function listPostsPublic(
  locale: AppLocale,
  f: { type?: PostType; category?: string; municipality?: string; featured?: boolean; hero?: boolean; q?: string },
  skip: number,
  take: number,
) {
  const where: Prisma.PostWhereInput = {
    ...publicWhere(),
    type: f.type,
    ...(f.featured ? { isFeatured: true } : {}),
    ...(f.hero ? { pinnedToHero: true } : {}),
    ...(f.category ? { category: { key: f.category } } : {}),
    ...(f.municipality ? { municipality: { slug: f.municipality } } : {}),
    ...(f.q ? { translations: { some: { OR: [{ title: { contains: f.q, mode: "insensitive" } }, { excerpt: { contains: f.q, mode: "insensitive" } }] } } } : {}),
  };
  const [rows, total] = await Promise.all([
    db.post.findMany({ where, include: publicInclude, orderBy: { publishedAt: "desc" }, skip, take }),
    db.post.count({ where }),
  ]);
  return { items: rows.map((r) => toPublicCard(r, locale)), total };
}

export async function getPostPublic(locale: AppLocale, slug: string) {
  const wanted = localeToEnum(locale);
  // Prefer the slug in the requested language, else any language (shared links).
  const tr =
    (await db.postTranslation.findFirst({ where: { locale: wanted, slug, post: publicWhere() }, select: { postId: true } })) ??
    (await db.postTranslation.findFirst({ where: { slug, post: publicWhere() }, select: { postId: true } }));
  if (!tr) throw notFound("Post");

  const p = await db.post.findUniqueOrThrow({
    where: { id: tr.postId },
    include: {
      ...publicInclude,
      translations: true,
      tags: { select: { slug: true, label: true } },
      attachment: { include: { translations: { include: { file: { select: { storageKey: true } } } } } },
    },
  });
  const t = pickTranslation(p.translations, locale)!;
  const card = toPublicCard(p, locale);
  const att = p.attachment ? pickTranslation(p.attachment.translations, locale) : null;
  return {
    ...card,
    contentHtml: t.contentHtml,
    seoTitle: t.seoTitle ?? t.title,
    seoDescription: t.seoDescription ?? t.excerpt,
    tags: p.tags,
    viewCount: p.viewCount,
    attachment: att?.file?.storageKey ? { title: att.title, url: urlFor(att.file.storageKey) } : null,
    // hreflang alternates for SEO.
    alternates: p.translations.map((x) => ({ locale: x.locale.toLowerCase(), slug: x.slug })),
  };
}

/** Counts one view per post per visitor per day (Redis), flushed by the worker. */
export async function recordView(postId: string, ip: string | null) {
  try {
    // Dili calendar day (UTC+9, no DST) so daily stats match what admins see.
    const day = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
    const visitor = blindIndex("view", `${ip ?? "anon"}:${day}`).slice(0, 16);
    const first = await redis().set(`viewed:${postId}:${visitor}`, "1", "EX", 86_400, "NX");
    if (first === "OK") await redis().incr(`views:post:${postId}:${day}`);
  } catch {
    /* analytics must never break page rendering */
  }
}

// -----------------------------------------------------------------------------
// Worker jobs
// -----------------------------------------------------------------------------
export async function publishDueScheduledPosts(): Promise<number> {
  const due = await db.post.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: new Date() }, deletedAt: null },
    select: { id: true, scheduledAt: true },
  });
  for (const p of due) {
    await db.post.update({ where: { id: p.id }, data: { status: "PUBLISHED", publishedAt: p.scheduledAt } });
    await audit({ action: "post.published", actorEmail: "system@worker", entityType: "Post", entityId: p.id, metadata: { scheduled: true } });
  }
  return due.length;
}

export async function flushPostViews(): Promise<number> {
  const r = redis();
  const prefix = env().REDIS_KEY_PREFIX;
  let cursor = "0";
  let flushed = 0;
  do {
    // SCAN patterns are not auto-prefixed by ioredis; returned keys include the prefix.
    const [next, keys] = await r.scan(cursor, "MATCH", `${prefix}views:post:*`, "COUNT", 500);
    cursor = next;
    for (const fullKey of keys) {
      const key = fullKey.slice(prefix.length);
      const [, , postId, day] = key.split(":");
      const raw = await r.getdel(key);
      const views = Number(raw ?? 0);
      if (!postId || !day || !views) continue;
      try {
        await db.$transaction([
          db.postViewDaily.upsert({
            where: { postId_day: { postId, day: new Date(`${day}T00:00:00Z`) } },
            create: { postId, day: new Date(`${day}T00:00:00Z`), views },
            update: { views: { increment: views } },
          }),
          db.post.update({ where: { id: postId }, data: { viewCount: { increment: views } } }),
        ]);
        flushed += views;
      } catch {
        // Post deleted meanwhile — drop the counter.
      }
    }
  } while (cursor !== "0");
  return flushed;
}
