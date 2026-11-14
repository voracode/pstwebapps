import { cache } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, CalendarDays, Clock, Download, FileText, MapPin, Tag } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Alert, Badge } from "@/components/ui/primitives";
import { buttonVariants } from "@/components/ui/button";
import { MediaImage } from "@/components/public/media-image";
import { PostCard } from "@/components/public/cards";
import { ShareLinks } from "@/components/public/share-links";
import { asLocale } from "@/components/public/locale";
import { ApiError } from "@/lib/http";
import { clientIp } from "@/lib/request";
import { formatDate } from "@/lib/format";
import { LOCALES, type AppLocale } from "@/lib/validation/common";
import { getPostPublic, listPostsPublic, recordView } from "@/server/services/post.service";
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

  const related = (await listPostsPublic(locale, { type: post.type }, 0, 4)).items.filter((p) => p.id !== post.id).slice(0, 3);
  const url = `${appUrl()}/${locale}/news/${post.slug}`;
  const coverAlt = post.cover ? (pickJson(post.cover.alt, locale) ?? post.title) : "";

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

  return (
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <header className="bg-gradient-to-b from-pst-ink to-pst-red-900 text-white">
        <div className="mx-auto max-w-3xl px-4 pb-10 pt-8 sm:pt-12">
          <Link href="/news" className="mb-6 inline-flex items-center gap-1 text-sm text-white/70 hover:text-white">
            <ArrowLeft className="size-4" aria-hidden />
            {t("news.back")}
          </Link>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge variant={post.type === "STATEMENT" ? "gold" : "default"}>{te(post.type)}</Badge>
            {post.category && <span className="text-sm font-medium text-white/80">{post.category.name}</span>}
          </div>
          <h1 className="text-4xl font-extrabold leading-[1.05] sm:text-5xl" lang={post.locale}>
            {post.title}
          </h1>
          {post.excerpt && (
            <p className="mt-4 text-lg text-white/85" lang={post.locale}>
              {post.excerpt}
            </p>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/75">
            {post.byline && <span className="font-semibold text-white">{post.byline}</span>}
            {post.publishedAt && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-4" aria-hidden />
                <time dateTime={post.publishedAt.toISOString()}>{formatDate(post.publishedAt, locale)}</time>
              </span>
            )}
            {post.readingMinutes ? (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-4" aria-hidden />
                {t("common.readingTime", { minutes: post.readingMinutes })}
              </span>
            ) : null}
            {post.municipality && (
              <Link href={`/municipalities/${post.municipality.slug}`} className="inline-flex items-center gap-1.5 hover:text-white">
                <MapPin className="size-4" aria-hidden />
                {post.municipality.name}
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-10">
        {post.cover && (
          <figure className="-mt-16 mb-8 overflow-hidden rounded-xl shadow-lg sm:-mt-20">
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

        <footer className="mt-10 space-y-5 border-t pt-6">
          {post.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Tag className="size-4 text-muted-foreground" aria-hidden />
              <span className="sr-only">{t("news.tags")}:</span>
              {post.tags.map((tag) => (
                <Link key={tag.slug} href={`/news?q=${encodeURIComponent(tag.label)}`} className="rounded-full bg-muted px-3 py-1 text-xs font-semibold hover:bg-pst-red-50 hover:text-pst-red">
                  #{tag.label}
                </Link>
              ))}
            </div>
          )}
          <ShareLinks url={url} title={post.title} />
        </footer>
      </div>

      {related.length > 0 && (
        <aside className="bg-surface py-12" aria-labelledby="related-h">
          <div className="mx-auto max-w-6xl px-4">
            <div className="mb-6 flex items-center justify-between gap-4">
              <h2 id="related-h" className="text-3xl font-extrabold uppercase">
                {t("news.more")}
              </h2>
              <Link href="/news" className={buttonVariants({ variant: "outline", size: "sm" })}>
                {t("common.viewAll")}
              </Link>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((p) => (
                <PostCard key={p.id} post={p} locale={locale} />
              ))}
            </div>
          </div>
        </aside>
      )}
    </article>
  );
}
