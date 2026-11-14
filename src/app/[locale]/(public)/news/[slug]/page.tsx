import { cache } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, ArrowRight, CalendarDays, ChevronRight, Clock, Download, FileText, FolderOpen, MapPin, Search, Tag, UserRound } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Alert, Badge } from "@/components/ui/primitives";
import { ImageFallback, MediaImage } from "@/components/public/media-image";
import { ShareBar } from "@/components/public/share-links";
import { Emblem } from "@/components/brand/emblem";
import { asLocale } from "@/components/public/locale";
import { ApiError } from "@/lib/http";
import { clientIp } from "@/lib/request";
import { formatDate } from "@/lib/format";
import { LOCALES, type AppLocale } from "@/lib/validation/common";
import { getPostPublic, recordView } from "@/server/services/post.service";
import { getAdjacentPosts, listLatestPostsInLocale, type PostNavItem } from "@/server/services/post-nav.service";
import { pickJson } from "@/server/services/public-site.service";

type Props = { params: Promise<{ locale: string; slug: string }> };

const loadPost = cache(async (locale: AppLocale, slug: string) => {
  if (slug.length > 240) return null;
  try {
    return await getPostPublic(locale, slug);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
});

/** Plain text of the first paragraph of the article body (for de-duplicating the excerpt). */
function firstParagraphText(html: string | null): string {
  const m = html?.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  return norm(m?.[1] ?? "");
}
function norm(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&[a-z#0-9]+;/gi, "")
    .replace(/[\s"'“”‘’«»]+/g, " ")
    .trim()
    .toLowerCase();
}
/** True when the excerpt just repeats the opening of the article body. */
function excerptRepeatsBody(excerpt: string, html: string | null): boolean {
  const e = norm(excerpt);
  const p = firstParagraphText(html);
  if (!e || !p) return false;
  const probe = Math.min(e.length, p.length, 120);
  return probe >= 40 && e.slice(0, probe) === p.slice(0, probe);
}

const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  const locale = asLocale(raw);
  const post = await loadPost(locale, decodeURIComponent(slug));
  if (!post) return {};
  const languages: Record<string, string> = {};
  for (const a of post.alternates) if ((LOCALES as readonly string[]).includes(a.locale)) languages[a.locale === "tet" ? "tet-TL" : a.locale] = `/${a.locale}/news/${a.slug}`;
  const description = post.seoDescription ?? post.excerpt ?? undefined;
  return {
    title: post.seoTitle,
    description,
    alternates: { canonical: `/${locale}/news/${post.slug}`, languages },
    openGraph: {
      type: "article",
      title: post.seoTitle,
      description,
      publishedTime: post.publishedAt?.toISOString(),
      images: post.cover ? [{ url: post.cover.url, width: post.cover.width ?? undefined, height: post.cover.height ?? undefined }] : ["/brand/emblem.png"],
    },
    twitter: { card: post.cover ? "summary_large_image" : "summary", title: post.seoTitle, description },
  };
}

export default async function ArticlePage({ params }: Props) {
  const { locale: raw, slug: rawSlug } = await params;
  const locale = asLocale(raw);
  setRequestLocale(locale);
  const slug = decodeURIComponent(rawSlug);
  const post = await loadPost(locale, slug);
  if (!post) notFound();

  const t = await getTranslations("public");
  const te = await getTranslations("common.enums.postType");

  await recordView(post.id, clientIp(await headers()));

  const [latest, { prev, next }] = await Promise.all([listLatestPostsInLocale(locale, post.id, 5), getAdjacentPosts(locale, post)]);
  const url = `${appUrl()}/${locale}/news/${post.slug}`;
  const coverAlt = post.cover ? (pickJson(post.cover.alt, locale) ?? post.title) : "";
  const author = post.byline ?? t("meta.name");
  const heroExcerpt = post.excerpt && !excerptRepeatsBody(post.excerpt, post.contentHtml) ? post.excerpt : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": post.type === "NEWS" ? "NewsArticle" : "Article",
    headline: post.title,
    datePublished: post.publishedAt?.toISOString(),
    inLanguage: post.locale,
    image: post.cover ? [post.cover.url.startsWith("http") ? post.cover.url : `${appUrl()}${post.cover.url}`] : undefined,
    author: { "@type": "Organization", name: post.byline ?? "Partido Socialista de Timor" },
    publisher: { "@type": "Organization", name: "Partido Socialista de Timor", logo: { "@type": "ImageObject", url: `${appUrl()}/brand/emblem.png` } },
    mainEntityOfPage: url,
  };

  const meta = [
    post.publishedAt && (
      <span key="date" className="inline-flex items-center gap-1.5">
        <CalendarDays className="size-4 text-pst-gold" aria-hidden />
        <time dateTime={post.publishedAt.toISOString()}>{formatDate(post.publishedAt, locale)}</time>
      </span>
    ),
    <span key="author" className="inline-flex items-center gap-1.5 font-semibold text-white">
      <UserRound className="size-4 text-pst-gold" aria-hidden />
      {author}
    </span>,
    post.category && (
      <Link key="cat" href={`/news?category=${encodeURIComponent(post.category.key)}`} className="inline-flex items-center gap-1.5 hover:text-white">
        <FolderOpen className="size-4 text-pst-gold" aria-hidden />
        {post.category.name}
      </Link>
    ),
    post.readingMinutes ? (
      <span key="read" className="inline-flex items-center gap-1.5">
        <Clock className="size-4 text-pst-gold" aria-hidden />
        {t("common.readingTime", { minutes: post.readingMinutes })}
      </span>
    ) : null,
    post.municipality && (
      <Link key="mun" href={`/municipalities/${post.municipality.slug}`} className="inline-flex items-center gap-1.5 hover:text-white">
        <MapPin className="size-4 text-pst-gold" aria-hidden />
        {post.municipality.name}
      </Link>
    ),
  ].filter(Boolean);

  return (
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      {/* Hero: cover photo as backdrop under a PST red/ink overlay. */}
      <header className="relative isolate overflow-hidden bg-gradient-to-br from-pst-red-800 via-pst-red-900 to-pst-ink text-white">
        {post.cover && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={post.cover.url} alt="" aria-hidden className="absolute inset-0 -z-20 size-full scale-105 object-cover blur-[2px]" />
            <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-pst-ink/95 via-pst-red-900/85 to-pst-red-800/70" />
          </>
        )}
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-24 -z-10 size-72 rounded-full bg-pst-red/40 blur-3xl" />
        <div className="mx-auto max-w-6xl px-4 pb-10 pt-8 sm:pb-12 sm:pt-10">
          <nav aria-label={t("nav.breadcrumb")} className="mb-5">
            <ol className="flex flex-wrap items-center gap-1 text-xs text-white/70">
              <li>
                <Link href="/" className="hover:text-white">
                  {t("nav.home")}
                </Link>
              </li>
              <li className="flex items-center gap-1">
                <ChevronRight className="size-3" aria-hidden />
                <Link href="/news" className="hover:text-white">
                  {t("nav.news")}
                </Link>
              </li>
              <li className="flex items-center gap-1">
                <ChevronRight className="size-3" aria-hidden />
                <span className="text-white/90">{te(post.type)}</span>
              </li>
            </ol>
          </nav>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge variant={post.type === "STATEMENT" ? "gold" : "default"}>{te(post.type)}</Badge>
            {post.category && <span className="text-sm font-semibold uppercase tracking-wide text-pst-gold">{post.category.name}</span>}
          </div>
          <h1 className="max-w-4xl text-3xl font-extrabold leading-[1.05] sm:text-4xl lg:text-5xl" lang={post.locale}>
            {post.title}
          </h1>
          {heroExcerpt && (
            <p className="mt-4 line-clamp-3 max-w-3xl text-base text-white/85 sm:text-lg" lang={post.locale}>
              {heroExcerpt}
            </p>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/15 pt-4 text-sm text-white/80 sm:gap-x-3">
            {meta.map((m, i) => (
              <span key={i} className="inline-flex items-center gap-3">
                {i > 0 && (
                  <span aria-hidden className="hidden text-white/35 sm:inline">
                    |
                  </span>
                )}
                {m}
              </span>
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 lg:grid-cols-[minmax(0,1fr)_20rem] xl:gap-14">
        {/* Main column */}
        <div className="min-w-0">
          {post.cover && (
            <figure className="mb-8 overflow-hidden rounded-xl shadow-md">
              <MediaImage
                src={post.cover.url}
                alt={coverAlt}
                blurDataUrl={post.cover.blurDataUrl}
                width={post.cover.width}
                height={post.cover.height}
                eager
                className="aspect-[16/9] w-full"
              />
            </figure>
          )}
          {post.isFallback && (
            <Alert variant="info" className="mb-6">
              {t("common.fallbackNotice")}
            </Alert>
          )}
          {post.contentHtml && <div className="prose-pst prose-lg" lang={post.locale} dangerouslySetInnerHTML={{ __html: post.contentHtml }} />}

          {post.attachment && (
            <a
              href={post.attachment.url}
              className="mt-8 flex items-center gap-4 rounded-lg border bg-surface p-4 transition-colors hover:border-pst-red"
              target="_blank"
              rel="noopener"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-pst-red text-white">
                <FileText className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("news.attachment")}</span>
                <span className="block truncate font-semibold">{post.attachment.title}</span>
              </span>
              <Download className="size-5 text-pst-red" aria-hidden />
            </a>
          )}

          {post.tags.length > 0 && (
            <div className="mt-8 flex flex-wrap items-center gap-2">
              <Tag className="size-4 text-muted-foreground" aria-hidden />
              <span className="sr-only">{t("news.tags")}:</span>
              {post.tags.map((tag) => (
                <Link key={tag.slug} href={`/news?q=${encodeURIComponent(tag.label)}`} className="rounded-full bg-muted px-3 py-1 text-xs font-semibold hover:bg-pst-red-50 hover:text-pst-red">
                  #{tag.label}
                </Link>
              ))}
            </div>
          )}

          <ShareBar url={url} title={post.title} className="mt-8" />

          {/* Byline box */}
          <section aria-label={t("news.author")} className="mt-8 flex gap-4 rounded-xl border-t-4 border-pst-gold bg-surface p-5 sm:gap-5 sm:p-6">
            <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-white shadow ring-2 ring-pst-red/20">
              <Emblem size={48} />
            </span>
            <div className="min-w-0">
              <p className="font-display text-xl font-extrabold leading-tight">{author}</p>
              <p className="mt-0.5 text-[0.7rem] font-bold uppercase tracking-widest text-pst-red">{t("news.authorRole")}</p>
              <p className="mt-2 text-sm text-muted-foreground">{t("news.authorBio")}</p>
            </div>
          </section>

          {(prev || next) && (
            <nav aria-label={t("news.postNav")} className="mt-8 grid gap-4 border-t border-dashed pt-8 sm:grid-cols-2">
              {prev ? <AdjacentLink item={prev} dir="prev" label={t("news.prev")} /> : <span className="hidden sm:block" />}
              {next && <AdjacentLink item={next} dir="next" label={t("news.next")} />}
            </nav>
          )}

          <Link href="/news" className="mt-8 inline-flex items-center gap-1 text-sm font-semibold text-pst-red hover:underline">
            <ArrowLeft className="size-4" aria-hidden />
            {t("news.back")}
          </Link>
        </div>

        {/* Sidebar (stacks under the article on small screens) */}
        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start" aria-label={t("news.latest")}>
          <form action={`/${locale}/news`} method="get" role="search" className="flex overflow-hidden rounded-lg border bg-background shadow-sm focus-within:ring-2 focus-within:ring-ring">
            <label htmlFor="news-search" className="sr-only">
              {t("news.searchNews")}
            </label>
            <input
              id="news-search"
              type="search"
              name="q"
              maxLength={100}
              placeholder={t("news.searchPlaceholder")}
              className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
            />
            <button type="submit" aria-label={t("news.search")} className="flex w-12 items-center justify-center bg-pst-red text-white transition-colors hover:bg-pst-red-700">
              <Search className="size-4" aria-hidden />
            </button>
          </form>

          {latest.length > 0 && (
            <section className="rounded-xl border bg-card p-5 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-extrabold uppercase tracking-wide">
                <span aria-hidden className="h-5 w-1.5 rounded-full bg-pst-red" />
                {t("news.latest")}
              </h2>
              <ul className="divide-y">
                {latest.map((p) => (
                  <li key={p.id} className="py-3 first:pt-0">
                    <Link href={`/news/${p.slug}`} className="group flex gap-3">
                      {p.cover ? (
                        <MediaImage src={p.cover.url} alt="" blurDataUrl={p.cover.blurDataUrl} width={p.cover.width} height={p.cover.height} className="size-16 shrink-0 rounded-md" />
                      ) : (
                        <ImageFallback className="size-16 shrink-0 rounded-md [&_span]:text-xs" />
                      )}
                      <span className="min-w-0">
                        <span className="line-clamp-3 text-sm font-bold leading-snug group-hover:text-pst-red">{p.title}</span>
                        {p.publishedAt && (
                          <time dateTime={p.publishedAt.toISOString()} className="mt-1 block text-xs text-muted-foreground">
                            {formatDate(p.publishedAt, locale)}
                          </time>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href="/news" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-pst-red hover:underline">
                {t("common.viewAll")}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </section>
          )}
        </aside>
      </div>
    </article>
  );
}

function AdjacentLink({ item, dir, label }: { item: PostNavItem; dir: "prev" | "next"; label: string }) {
  const Icon = dir === "prev" ? ArrowLeft : ArrowRight;
  return (
    <Link
      href={`/news/${item.slug}`}
      rel={dir}
      className={`group flex flex-col gap-1.5 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-pst-red ${dir === "next" ? "sm:items-end sm:text-right" : ""}`}
    >
      <span className="inline-flex items-center gap-1 text-[0.7rem] font-bold uppercase tracking-widest text-pst-red">
        {dir === "prev" && <Icon className="size-3.5" aria-hidden />}
        {label}
        {dir === "next" && <Icon className="size-3.5" aria-hidden />}
      </span>
      <span className="line-clamp-2 text-sm font-bold leading-snug group-hover:text-pst-red">{item.title}</span>
    </Link>
  );
}

