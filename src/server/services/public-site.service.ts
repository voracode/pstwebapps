import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { pickTranslation } from "@/lib/i18n/pick";
import { videoProvider } from "@/lib/sanitize";
import { urlFor } from "@/lib/storage";
import type { AppLocale } from "@/lib/validation/common";
import type { PageKey } from "@/generated/prisma/client";

/**
 * Read-only queries for the public portal that have no REST counterpart:
 * static page sections, hero slides, site settings, albums, video embeds,
 * categories and sitemap entries. Everything here is public data only.
 */

type LocalizedJson = Partial<Record<AppLocale, string>> | null;

/** Picks a value from a `{ tet, pt, id, en }` JSON column with the usual fallback. */
export function pickJson(value: unknown, locale: AppLocale): string | null {
  if (!value || typeof value !== "object") return typeof value === "string" ? value : null;
  const v = value as LocalizedJson;
  for (const l of [locale, "tet", "pt", "en", "id"] as const) {
    const s = v?.[l];
    if (typeof s === "string" && s.trim()) return s;
  }
  return null;
}

export interface PublicImage {
  url: string;
  blurDataUrl: string | null;
  width: number | null;
  height: number | null;
  alt: string | null;
}

function image(
  m: { storageKey: string | null; blurDataUrl: string | null; width: number | null; height: number | null; altText: unknown; visibility: string; deletedAt: Date | null } | null,
  locale: AppLocale,
): PublicImage | null {
  if (!m?.storageKey || m.visibility !== "PUBLIC" || m.deletedAt) return null;
  return { url: urlFor(m.storageKey), blurDataUrl: m.blurDataUrl, width: m.width, height: m.height, alt: pickJson(m.altText, locale) };
}

const imageSelect = { storageKey: true, blurDataUrl: true, width: true, height: true, altText: true, visibility: true, deletedAt: true } as const;

// -----------------------------------------------------------------------------
// Page sections (About / History / Ideology / Program)
// -----------------------------------------------------------------------------
export const getPageSections = cache(async (locale: AppLocale, pages: PageKey[]) => {
  const rows = await db.pageSection.findMany({
    where: { page: { in: pages }, isVisible: true },
    include: { translations: { select: { locale: true, title: true, contentHtml: true } } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows
    .map((s) => {
      const t = pickTranslation(s.translations, locale);
      if (!t) return null;
      return { id: s.id, page: s.page, icon: s.icon, title: t.title, contentHtml: t.contentHtml, isFallback: t.isFallback };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);
});

// -----------------------------------------------------------------------------
// Hero slides
// -----------------------------------------------------------------------------
export async function getActiveHeroSlides(locale: AppLocale) {
  const now = new Date();
  const rows = await db.heroSlide.findMany({
    where: {
      isActive: true,
      AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
    },
    include: { translations: true, image: { select: imageSelect } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    take: 6,
  });
  return rows
    .map((s) => {
      const t = pickTranslation(s.translations, locale);
      if (!t) return null;
      return {
        id: s.id,
        headline: t.headline,
        subline: t.subline,
        ctaLabel: t.ctaLabel,
        ctaHref: s.ctaHref,
        image: image(s.image, locale),
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);
}

export type HeroSlideDto = Awaited<ReturnType<typeof getActiveHeroSlides>>[number];

// -----------------------------------------------------------------------------
// Site settings (contact & social)
// -----------------------------------------------------------------------------
const SOCIAL_KEYS = ["facebook", "youtube", "instagram", "tiktok", "x"] as const;
export type SocialKey = (typeof SOCIAL_KEYS)[number];

function safeHttpUrl(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  try {
    const u = new URL(v.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export const getSiteContact = cache(async (locale: AppLocale) => {
  const rows = await db.siteSetting.findMany({ where: { key: { in: ["contact.headquarters", "social.links", "site.motto"] } } });
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, unknown>;

  const hq = (byKey["contact.headquarters"] ?? {}) as Record<string, unknown>;
  const social = (byKey["social.links"] ?? {}) as Record<string, unknown>;
  const address = typeof hq.address === "object" && hq.address ? pickJson(hq.address, locale) : str(hq.address);

  return {
    motto: str(byKey["site.motto"]) ?? "Pelo Progresso, Igualdade",
    headquarters: {
      address,
      phone: str(hq.phone),
      email: str(hq.email),
      whatsapp: str(hq.whatsapp),
      hours: typeof hq.hours === "object" && hq.hours ? pickJson(hq.hours, locale) : str(hq.hours),
    },
    social: SOCIAL_KEYS.map((k) => ({ key: k, url: safeHttpUrl(social[k]) })).filter((s): s is { key: SocialKey; url: string } => !!s.url),
  };
});

// -----------------------------------------------------------------------------
// Categories (news filter)
// -----------------------------------------------------------------------------
export const listCategoriesPublic = cache(async (locale: AppLocale) => {
  const rows = await db.category.findMany({ include: { translations: true }, orderBy: { sortOrder: "asc" } });
  return rows.map((c) => ({ key: c.key, name: pickTranslation(c.translations, locale)?.name ?? c.key }));
});

// -----------------------------------------------------------------------------
// Albums & videos
// -----------------------------------------------------------------------------
const publishedAlbum = () => ({ status: "PUBLISHED" as const, OR: [{ publishedAt: null }, { publishedAt: { lte: new Date() } }] });

export async function listAlbumsPublic(locale: AppLocale, skip: number, take: number) {
  const where = publishedAlbum();
  const [rows, total] = await Promise.all([
    db.album.findMany({
      where,
      include: {
        translations: true,
        cover: { select: imageSelect },
        items: { take: 1, orderBy: { sortOrder: "asc" }, include: { media: { select: imageSelect } } },
        _count: { select: { items: true } },
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      skip,
      take,
    }),
    db.album.count({ where }),
  ]);
  return {
    items: rows.map((a) => {
      const t = pickTranslation(a.translations, locale);
      return {
        slug: a.slug,
        title: t?.title ?? a.slug,
        description: t?.description ?? null,
        publishedAt: a.publishedAt ?? a.createdAt,
        count: a._count.items,
        cover: image(a.cover, locale) ?? image(a.items[0]?.media ?? null, locale),
      };
    }),
    total,
  };
}

export const getAlbumPublic = cache(async (locale: AppLocale, slug: string) => {
  const a = await db.album.findFirst({
    where: { slug, ...publishedAlbum() },
    include: {
      translations: true,
      cover: { select: imageSelect },
      event: { select: { slug: true, translations: { select: { locale: true, title: true } } } },
      items: { orderBy: { sortOrder: "asc" }, include: { media: { select: { ...imageSelect, kind: true } } } },
    },
  });
  if (!a) return null;
  const t = pickTranslation(a.translations, locale);
  return {
    slug: a.slug,
    title: t?.title ?? a.slug,
    description: t?.description ?? null,
    publishedAt: a.publishedAt ?? a.createdAt,
    cover: image(a.cover, locale),
    event: a.event ? { slug: a.event.slug, title: pickTranslation(a.event.translations, locale)?.title ?? a.event.slug } : null,
    photos: a.items
      .filter((i) => i.media.kind === "IMAGE")
      .map((i) => {
        const img = image(i.media, locale);
        return img ? { ...img, caption: pickJson(i.caption, locale) } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
  };
});

/** Privacy-friendly embed URL (no-cookie / do-not-track variants). */
export function embedUrlFor(url: string): { provider: "youtube" | "vimeo" | "facebook"; embedUrl: string } | null {
  const provider = videoProvider(url);
  if (!provider) return null;
  const u = new URL(url);
  if (provider === "youtube") {
    let id: string | null = null;
    if (u.hostname.endsWith("youtu.be")) id = u.pathname.slice(1).split("/")[0] ?? null;
    else if (u.pathname.startsWith("/watch")) id = u.searchParams.get("v");
    else {
      const m = /^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(u.pathname);
      id = m?.[1] ?? null;
    }
    if (!id || !/^[A-Za-z0-9_-]{6,20}$/.test(id)) return null;
    return { provider, embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0` };
  }
  if (provider === "vimeo") {
    const m = /\/(?:video\/)?(\d{5,12})/.exec(u.pathname);
    if (!m) return null;
    return { provider, embedUrl: `https://player.vimeo.com/video/${m[1]}?dnt=1&autoplay=1` };
  }
  return { provider, embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false&autoplay=true` };
}

export async function listVideosPublic(locale: AppLocale, take: number) {
  const rows = await db.mediaAsset.findMany({
    where: { kind: "VIDEO_EMBED", visibility: "PUBLIC", deletedAt: null, externalUrl: { not: null } },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, externalUrl: true, altText: true, credit: true, createdAt: true },
  });
  return rows
    .map((v) => {
      const e = v.externalUrl ? embedUrlFor(v.externalUrl) : null;
      if (!e) return null;
      return { id: v.id, ...e, sourceUrl: v.externalUrl!, title: pickJson(v.altText, locale), credit: v.credit, createdAt: v.createdAt };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);
}

export type VideoDto = Awaited<ReturnType<typeof listVideosPublic>>[number];

// -----------------------------------------------------------------------------
// Municipality extras
// -----------------------------------------------------------------------------
export const getMunicipalityAdminPosts = cache(async (slug: string) => {
  const m = await db.municipality.findUnique({
    where: { slug },
    select: { id: true, adminPosts: { select: { name: true }, orderBy: { name: "asc" } } },
  });
  return m ? m.adminPosts.map((p) => p.name) : null;
});

// -----------------------------------------------------------------------------
// Sitemap
// -----------------------------------------------------------------------------
export async function sitemapEntries() {
  const now = new Date();
  const [posts, events, municipalities, albums, documents] = await Promise.all([
    db.postTranslation.findMany({
      where: { post: { deletedAt: null, status: "PUBLISHED", publishedAt: { lte: now } } },
      select: { locale: true, slug: true, updatedAt: true, post: { select: { id: true } } },
      orderBy: { updatedAt: "desc" },
      take: 5000,
    }),
    db.event.findMany({
      where: { deletedAt: null, isPublic: true, status: { in: ["SCHEDULED", "ONGOING", "COMPLETED", "POSTPONED", "CANCELLED"] } },
      select: { slug: true, updatedAt: true },
      orderBy: { startsAt: "desc" },
      take: 2000,
    }),
    db.municipality.findMany({ select: { slug: true, updatedAt: true }, orderBy: { sortOrder: "asc" } }),
    db.album.findMany({ where: publishedAlbum(), select: { slug: true, updatedAt: true }, take: 1000 }),
    db.document.findFirst({ where: { deletedAt: null, isPublic: true }, select: { updatedAt: true }, orderBy: { updatedAt: "desc" } }),
  ]);
  return {
    posts: posts.map((p) => ({ postId: p.post.id, locale: p.locale.toLowerCase() as AppLocale, slug: p.slug, updatedAt: p.updatedAt })),
    events,
    municipalities,
    albums,
    documentsUpdatedAt: documents?.updatedAt ?? null,
  };
}
