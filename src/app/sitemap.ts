import type { MetadataRoute } from "next";
import { LOCALES } from "@/lib/validation/common";
import { sitemapEntries } from "@/server/services/public-site.service";

// Rendered per request (cached by Nginx/CDN) — must not query the DB at build time.
export const dynamic = "force-dynamic";

const base = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const hreflang = (l: string) => (l === "tet" ? "tet-TL" : l);

const STATIC_PATHS: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "", priority: 1, changeFrequency: "daily" },
  { path: "/about", priority: 0.8, changeFrequency: "monthly" },
  { path: "/about/program", priority: 0.8, changeFrequency: "monthly" },
  { path: "/about/statute", priority: 0.7, changeFrequency: "monthly" },
  { path: "/about/leadership", priority: 0.7, changeFrequency: "monthly" },
  { path: "/news", priority: 0.9, changeFrequency: "daily" },
  { path: "/press", priority: 0.8, changeFrequency: "daily" },
  { path: "/media", priority: 0.6, changeFrequency: "weekly" },
  { path: "/documents", priority: 0.7, changeFrequency: "weekly" },
  { path: "/municipalities", priority: 0.7, changeFrequency: "monthly" },
  { path: "/events", priority: 0.8, changeFrequency: "daily" },
  { path: "/join", priority: 0.9, changeFrequency: "monthly" },
  { path: "/voice", priority: 0.7, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.5, changeFrequency: "yearly" },
];

/** One entry per locale, each listing every language version (hreflang). */
function allLocales(path: string, extra: Omit<MetadataRoute.Sitemap[number], "url" | "alternates">): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(LOCALES.map((l) => [hreflang(l), `${base()}/${l}${path}`]));
  return LOCALES.map((l) => ({ url: `${base()}/${l}${path}`, alternates: { languages }, ...extra }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const out: MetadataRoute.Sitemap = [];
  for (const s of STATIC_PATHS) out.push(...allLocales(s.path, { changeFrequency: s.changeFrequency, priority: s.priority }));

  let data: Awaited<ReturnType<typeof sitemapEntries>>;
  try {
    data = await sitemapEntries();
  } catch (err) {
    console.error("[sitemap] database unavailable:", (err as Error).message);
    return out;
  }

  if (data.documentsUpdatedAt) {
    for (const e of out) if (e.url.endsWith("/documents")) e.lastModified = data.documentsUpdatedAt;
  }

  // Posts: slugs differ per language, so each translation is its own URL.
  const byPost = new Map<string, typeof data.posts>();
  for (const p of data.posts) byPost.set(p.postId, [...(byPost.get(p.postId) ?? []), p]);
  for (const versions of byPost.values()) {
    const languages = Object.fromEntries(versions.map((v) => [hreflang(v.locale), `${base()}/${v.locale}/news/${v.slug}`]));
    for (const v of versions) {
      out.push({ url: `${base()}/${v.locale}/news/${v.slug}`, lastModified: v.updatedAt, changeFrequency: "monthly", priority: 0.7, alternates: { languages } });
    }
  }
  for (const e of data.events) out.push(...allLocales(`/events/${e.slug}`, { lastModified: e.updatedAt, changeFrequency: "weekly", priority: 0.6 }));
  for (const m of data.municipalities) out.push(...allLocales(`/municipalities/${m.slug}`, { lastModified: m.updatedAt, changeFrequency: "monthly", priority: 0.6 }));
  for (const a of data.albums) out.push(...allLocales(`/media/${a.slug}`, { lastModified: a.updatedAt, changeFrequency: "monthly", priority: 0.4 }));
  return out;
}
