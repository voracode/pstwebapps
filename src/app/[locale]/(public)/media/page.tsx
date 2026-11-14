import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Camera, Images, Video } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { EmptyState } from "@/components/ui/primitives";
import { PageBody, PageHeader } from "@/components/public/page-header";
import { ImageFallback, MediaImage } from "@/components/public/media-image";
import { VideoEmbed } from "@/components/public/video-embed";
import { ListPagination } from "@/components/public/list-controls";
import { alternatesFor, asLocale, pageParam } from "@/components/public/locale";
import { formatDate } from "@/lib/format";
import { listAlbumsPublic, listVideosPublic } from "@/server/services/public-site.service";

export const revalidate = 300;

const PAGE_SIZE = 12;

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "public.media" });
  return { title: t("title"), description: t("lead"), alternates: alternatesFor(locale, "/media") };
}

export default async function MediaPage({ params, searchParams }: Props) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const s = await searchParams;
  const t = await getTranslations("public.media");
  const tn = await getTranslations("public.nav");
  const page = pageParam(s.page);

  const [albums, videos] = await Promise.all([listAlbumsPublic(locale, (page - 1) * PAGE_SIZE, PAGE_SIZE), page === 1 ? listVideosPublic(locale, 12) : Promise.resolve([])]);
  const empty = albums.total === 0 && videos.length === 0;

  return (
    <>
      <PageHeader title={t("title")} lead={t("lead")} crumbs={[{ label: tn("media") }]} />
      <PageBody className="space-y-16">
        {empty ? (
          <EmptyState icon={Camera} title={t("noAlbums")} description={t("noVideos")} />
        ) : (
          <>
            <section aria-labelledby="albums-h">
              <h2 id="albums-h" className="mb-6 flex items-center gap-3 text-3xl font-extrabold uppercase">
                <Images className="size-7 text-pst-red" aria-hidden />
                {t("albums")}
              </h2>
              {albums.items.length > 0 ? (
                <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {albums.items.map((a) => (
                    <li key={a.slug}>
                      <Link href={`/media/${a.slug}`} className="group relative block overflow-hidden rounded-lg shadow-sm">
                        <div className="aspect-[4/3]">
                          {a.cover ? (
                            <MediaImage
                              src={a.cover.url}
                              alt=""
                              blurDataUrl={a.cover.blurDataUrl}
                              className="size-full transition-transform duration-500 group-hover:scale-105 motion-reduce:transform-none"
                            />
                          ) : (
                            <ImageFallback className="size-full" />
                          )}
                        </div>
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-pst-ink via-pst-ink/70 to-transparent p-4 pt-12 text-white">
                          <p className="font-display text-xl font-bold leading-tight">{a.title}</p>
                          <p className="text-xs text-white/75">
                            {t("photos", { count: a.count })} · {formatDate(a.publishedAt, locale)}
                          </p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">{t("noAlbums")}</p>
              )}
              <ListPagination basePath={`/${locale}/media`} params={s} page={page} total={albums.total} pageSize={PAGE_SIZE} />
            </section>

            {page === 1 && (
              <section aria-labelledby="videos-h">
                <h2 id="videos-h" className="mb-6 flex items-center gap-3 text-3xl font-extrabold uppercase">
                  <Video className="size-7 text-pst-red" aria-hidden />
                  {t("videos")}
                </h2>
                {videos.length > 0 ? (
                  <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {videos.map((v) => (
                      <VideoEmbed key={v.id} provider={v.provider} embedUrl={v.embedUrl} sourceUrl={v.sourceUrl} title={v.title ?? t("untitled")} />
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">{t("noVideos")}</p>
                )}
              </section>
            )}
          </>
        )}
      </PageBody>
    </>
  );
}
