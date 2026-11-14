import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, CalendarDays, ImageOff } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { EmptyState } from "@/components/ui/primitives";
import { PageBody, PageHeader } from "@/components/public/page-header";
import { MediaImage } from "@/components/public/media-image";
import { asLocale } from "@/components/public/locale";
import { formatDate } from "@/lib/format";
import { getAlbumPublic } from "@/server/services/public-site.service";

export const revalidate = 300;

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const album = await getAlbumPublic(asLocale(locale), decodeURIComponent(slug).slice(0, 160));
  if (!album) return {};
  return {
    title: album.title,
    description: album.description ?? undefined,
    alternates: { canonical: `/${locale}/media/${album.slug}` },
    openGraph: { images: album.cover ? [album.cover.url] : album.photos[0] ? [album.photos[0].url] : undefined },
  };
}

export default async function AlbumPage({ params }: Props) {
  const { locale: raw, slug } = await params;
  const locale = asLocale(raw);
  setRequestLocale(locale);
  const album = await getAlbumPublic(locale, decodeURIComponent(slug).slice(0, 160));
  if (!album) notFound();
  const t = await getTranslations("public");

  return (
    <>
      <PageHeader
        title={album.title}
        lead={album.description}
        crumbs={[{ label: t("nav.media"), href: "/media" }, { label: album.title }]}
      >
        <p className="flex flex-wrap items-center gap-3 text-sm text-white/80">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-4" aria-hidden />
            {formatDate(album.publishedAt, locale)}
          </span>
          <span>{t("media.photos", { count: album.photos.length })}</span>
          {album.event && (
            <Link href={`/events/${album.event.slug}`} className="underline underline-offset-4 hover:text-white">
              {t("media.relatedEvent")}: {album.event.title}
            </Link>
          )}
        </p>
      </PageHeader>
      <PageBody>
        {album.photos.length > 0 ? (
          <ul className="columns-1 gap-4 sm:columns-2 lg:columns-3">
            {album.photos.map((p, i) => (
              <li key={p.url} className="mb-4 break-inside-avoid">
                <figure className="overflow-hidden rounded-lg bg-card shadow-sm">
                  <a href={p.url} target="_blank" rel="noopener" aria-label={`${t("media.openFull")}${p.alt ? `: ${p.alt}` : ""}`}>
                    <MediaImage
                      src={p.url}
                      alt={p.alt ?? p.caption ?? ""}
                      blurDataUrl={p.blurDataUrl}
                      width={p.width}
                      height={p.height}
                      eager={i < 3}
                      className="h-auto w-full"
                    />
                  </a>
                  {p.caption && <figcaption className="p-3 text-sm text-muted-foreground">{p.caption}</figcaption>}
                </figure>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={ImageOff} title={t("media.albumEmpty")} />
        )}
        <Link href="/media" className="mt-10 inline-flex items-center gap-1 text-sm font-semibold text-pst-red hover:underline">
          <ArrowLeft className="size-4" aria-hidden />
          {t("media.back")}
        </Link>
      </PageBody>
    </>
  );
}
