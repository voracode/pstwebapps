import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, CalendarDays, MapPin } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Alert, Badge } from "@/components/ui/primitives";
import { PageBody, PageHeader } from "@/components/public/page-header";
import { MediaImage } from "@/components/public/media-image";
import { ShareLinks } from "@/components/public/share-links";
import { alternatesFor, asLocale } from "@/components/public/locale";
import { ApiError } from "@/lib/http";
import { formatDate, formatTime } from "@/lib/format";
import type { AppLocale } from "@/lib/validation/common";
import { getEventPublic } from "@/server/services/event.service";

export const revalidate = 300;

type Props = { params: Promise<{ locale: string; slug: string }> };

const load = cache(async (locale: AppLocale, slug: string) => {
  if (slug.length > 160) return null;
  try {
    return await getEventPublic(locale, slug);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const e = await load(asLocale(locale), decodeURIComponent(slug));
  if (!e) return {};
  return {
    title: e.title,
    description: e.summary ?? undefined,
    alternates: alternatesFor(locale, `/events/${e.slug}`),
    openGraph: { images: e.coverUrl ? [e.coverUrl] : ["/brand/emblem.png"] },
  };
}

export default async function EventPage({ params }: Props) {
  const { locale: raw, slug } = await params;
  const locale = asLocale(raw);
  setRequestLocale(locale);
  const e = await load(locale, decodeURIComponent(slug));
  if (!e) notFound();

  const t = await getTranslations("public");
  const te = await getTranslations("common.enums");
  const start = new Date(e.startsAt);
  const end = e.endsAt ? new Date(e.endsAt) : null;
  const sameDay = end && formatDate(start, "en") === formatDate(end, "en");
  const where = [e.venue, e.suco, e.municipality?.name].filter(Boolean).join(", ");
  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: e.title,
    startDate: start.toISOString(),
    endDate: end?.toISOString(),
    eventStatus: `https://schema.org/Event${e.status === "CANCELLED" ? "Cancelled" : e.status === "POSTPONED" ? "Postponed" : "Scheduled"}`,
    location: where ? { "@type": "Place", name: where, address: where } : undefined,
    organizer: { "@type": "Organization", name: "Partido Socialista de Timor", url: appUrl },
    description: e.summary ?? undefined,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <PageHeader title={e.title} lead={e.summary} crumbs={[{ label: t("nav.events"), href: "/events" }, { label: e.title }]}>
        <div className="flex flex-wrap gap-2">
          <Badge variant="gold">{te(`eventType.${e.type}`)}</Badge>
          {e.status !== "SCHEDULED" && <Badge variant="dark">{te(`eventStatus.${e.status}`)}</Badge>}
        </div>
      </PageHeader>
      <PageBody>
        <div className="grid gap-10 lg:grid-cols-[1fr_20rem]">
          <div className="min-w-0 space-y-6">
            {e.status === "CANCELLED" && <Alert variant="error">{t("events.cancelled")}</Alert>}
            {e.status === "POSTPONED" && <Alert variant="warning">{t("events.postponed")}</Alert>}
            {e.isFallback && <Alert variant="info">{t("common.fallbackNotice")}</Alert>}
            {e.coverUrl && (
              <MediaImage src={e.coverUrl} alt="" blurDataUrl={e.blurDataUrl} eager className="aspect-[16/9] w-full rounded-xl shadow-sm" />
            )}
            {e.contentHtml && <div className="prose-pst" dangerouslySetInnerHTML={{ __html: e.contentHtml }} />}
            <ShareLinks url={`${appUrl}/${locale}/events/${e.slug}`} title={e.title} />
          </div>
          <aside className="space-y-4">
            <dl className="space-y-5 rounded-xl border bg-surface p-5">
              <div>
                <dt className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <CalendarDays className="size-4 text-pst-red" aria-hidden />
                  {t("events.when")}
                </dt>
                <dd className="font-semibold first-letter:uppercase">
                  <time dateTime={start.toISOString()}>{formatDate(start, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</time>
                </dd>
                <dd className="text-sm">
                  {formatTime(start, locale)}
                  {end && (
                    <>
                      {" – "}
                      <time dateTime={end.toISOString()}>{sameDay ? formatTime(end, locale) : `${formatDate(end, locale)} ${formatTime(end, locale)}`}</time>
                    </>
                  )}
                  <span className="text-muted-foreground"> ({t("events.timezone")})</span>
                </dd>
              </div>
              {where && (
                <div>
                  <dt className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <MapPin className="size-4 text-pst-red" aria-hidden />
                    {t("events.where")}
                  </dt>
                  <dd className="font-semibold">{where}</dd>
                  {e.municipality && (
                    <dd className="text-sm">
                      <Link href={`/municipalities/${e.municipality.slug}`} className="text-pst-red hover:underline">
                        {e.municipality.name}
                      </Link>
                    </dd>
                  )}
                  {e.latitude !== null && e.longitude !== null && (
                    <dd className="mt-1 text-sm">
                      <a
                        href={`https://www.openstreetmap.org/?mlat=${e.latitude}&mlon=${e.longitude}#map=16/${e.latitude}/${e.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-pst-red hover:underline"
                      >
                        {t("events.openMap")}
                      </a>
                    </dd>
                  )}
                </div>
              )}
            </dl>
            <Link href="/events" className="inline-flex items-center gap-1 text-sm font-semibold text-pst-red hover:underline">
              <ArrowLeft className="size-4" aria-hidden />
              {t("events.back")}
            </Link>
          </aside>
        </div>
      </PageBody>
    </>
  );
}
