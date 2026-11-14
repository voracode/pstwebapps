import { db } from "@/lib/db";
import { urlFor } from "@/lib/storage";
import { localeToEnum, type AppLocale } from "@/lib/validation/common";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Lightweight queries for the single-post page: sidebar "latest" list and
 * previous / next navigation. Only PUBLISHED posts that have a translation in
 * the requested locale are returned (no fallback languages here).
 */

const livePost = (): Prisma.PostWhereInput => ({ deletedAt: null, status: "PUBLISHED", publishedAt: { lte: new Date() } });

const select = {
  postId: true,
  title: true,
  slug: true,
  post: {
    select: {
      publishedAt: true,
      cover: { select: { storageKey: true, blurDataUrl: true, width: true, height: true, altText: true } },
    },
  },
} satisfies Prisma.PostTranslationSelect;

type Row = Prisma.PostTranslationGetPayload<{ select: typeof select }>;

export type PostNavItem = ReturnType<typeof toItem>;

function toItem(r: Row) {
  const c = r.post.cover;
  return {
    id: r.postId,
    title: r.title,
    slug: r.slug,
    publishedAt: r.post.publishedAt,
    cover: c?.storageKey ? { url: urlFor(c.storageKey), blurDataUrl: c.blurDataUrl, width: c.width, height: c.height } : null,
  };
}

/** Most recent published posts in `locale`, excluding `excludeId`. */
export async function listLatestPostsInLocale(locale: AppLocale, excludeId: string, take = 5): Promise<PostNavItem[]> {
  const rows = await db.postTranslation.findMany({
    where: { locale: localeToEnum(locale), postId: { not: excludeId }, post: livePost() },
    select,
    orderBy: [{ post: { publishedAt: "desc" } }, { postId: "desc" }],
    take,
  });
  return rows.map(toItem);
}

/** Previous (older) and next (newer) published posts in `locale`, by publish date. */
export async function getAdjacentPosts(
  locale: AppLocale,
  current: { id: string; publishedAt: Date | null },
): Promise<{ prev: PostNavItem | null; next: PostNavItem | null }> {
  if (!current.publishedAt) return { prev: null, next: null };
  const at = current.publishedAt;
  const base = { locale: localeToEnum(locale), postId: { not: current.id } };
  const [prev, next] = await Promise.all([
    db.postTranslation.findFirst({
      where: {
        ...base,
        post: { AND: [livePost(), { OR: [{ publishedAt: { lt: at } }, { publishedAt: at, id: { lt: current.id } }] }] },
      },
      select,
      orderBy: [{ post: { publishedAt: "desc" } }, { postId: "desc" }],
    }),
    db.postTranslation.findFirst({
      where: {
        ...base,
        post: { AND: [livePost(), { OR: [{ publishedAt: { gt: at } }, { publishedAt: at, id: { gt: current.id } }] }] },
      },
      select,
      orderBy: [{ post: { publishedAt: "asc" } }, { postId: "asc" }],
    }),
  ]);
  return { prev: prev ? toItem(prev) : null, next: next ? toItem(next) : null };
}
