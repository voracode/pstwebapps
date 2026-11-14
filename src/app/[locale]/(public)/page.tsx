import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, CalendarDays, FileText, MapPin, Megaphone, Newspaper, Search } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState, SectionHeading } from "@/components/ui/primitives";
import { Emblem, Stars } from "@/components/brand/emblem";
import { Hero } from "@/components/public/hero";
import { StatementTicker } from "@/components/public/statement-ticker";
import { DocumentCard, EventCard, PostCard, type PostCardData } from "@/components/public/cards";
import { FadeIn } from "@/components/public/fade-in";
import { alternatesFor, asLocale } from "@/components/public/locale";
import { cn } from "@/lib/utils/cn";
import { listPostsPublic } from "@/server/services/post.service";
import { listEventsPublic } from "@/server/services/event.service";
import { listDocumentsPublic, municipalDirectory } from "@/server/services/content.service";
import { getActiveHeroSlides } from "@/server/services/public-site.service";

export const revalidate = 300;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "public.meta" });
  return {
    title: { absolute: `${t("name")} · PST — Pelo Progresso, Igualdade` },
    description: t("description"),
    alternates: alternatesFor(locale, "/"),
  };
}

export default async function HomePage({ params }: Props) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("public");

  const [slides, hero, statements, news, events, featuredDocs, latestDocs, municipalities] = await Promise.all([
    getActiveHeroSlides(locale),
    listPostsPublic(locale, { hero: true }, 0, 8),
    listPostsPublic(locale, { type: "STATEMENT" }, 0, 8),
    listPostsPublic(locale, {}, 0, 7),
    listEventsPublic(locale, {}, 0, 4),
    listDocumentsPublic(locale, { featured: true }, 0, 3),
    listDocumentsPublic(locale, {}, 0, 3),
    municipalDirectory(locale),
  ]);

  // Ticker: pinned posts first, then statements; fall back to press releases.
  const seen = new Set<string>();
  let ticker: PostCardData[] = [...hero.items, ...statements.items].filter((p) => !seen.has(p.id) && seen.add(p.id));
  if (ticker.length === 0) ticker = (await listPostsPublic(locale, { type: "PRESS_RELEASE" }, 0, 6)).items;

  const [lead, ...rest] = news.items;
  const docs = featuredDocs.items.length > 0 ? featuredDocs.items : latestDocs.items;

  return (
    <>
      <Hero slides={slides} />
      <StatementTicker items={ticker.slice(0, 8)} locale={locale} />

      {/* Latest news */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:py-20" aria-labelledby="news-title">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <SectionHeading eyebrow={t("nav.news")} title={<span id="news-title">{t("home.latestNews")}</span>} description={t("home.latestNewsLead")} />
          {news.total > 0 && (
            <Link href="/news" className={buttonVariants({ variant: "outline" })}>
              {t("common.viewAll")}
              <ArrowRight aria-hidden />
            </Link>
          )}
        </div>
        {lead ? (
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <FadeIn>
              <PostCard post={lead} locale={locale} priority />
            </FadeIn>
            <div className="grid content-start gap-4">
              {rest.slice(0, 3).map((p) => (
                <PostCard key={p.id} post={p} locale={locale} variant="row" />
              ))}
            </div>
            {rest.length > 3 && (
              <div className="grid gap-6 sm:grid-cols-3 lg:col-span-2">
                {rest.slice(3, 6).map((p) => (
                  <PostCard key={p.id} post={p} locale={locale} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <EmptyState icon={Newspaper} title={t("home.noNews")} />
        )}
      </section>

      {/* Upcoming events + documents */}
      <section className="bg-surface py-14 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 lg:grid-cols-2">
          <div aria-labelledby="events-title">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <SectionHeading eyebrow={t("nav.events")} title={<span id="events-title">{t("home.upcomingEvents")}</span>} description={t("home.upcomingEventsLead")} />
            </div>
            {events.items.length > 0 ? (
              <div className="space-y-3">
                {events.items.map((e) => (
                  <EventCard key={e.slug} event={e} locale={locale} compact />
                ))}
                <Link href="/events" className={cn(buttonVariants({ variant: "link" }), "mt-2")}>
                  {t("common.viewAll")}
                  <ArrowRight aria-hidden />
                </Link>
              </div>
            ) : (
              <EmptyState icon={CalendarDays} title={t("home.noEvents")} className="bg-background" />
            )}
          </div>
          <div aria-labelledby="docs-title">
            <div className="mb-6">
              <SectionHeading eyebrow={t("nav.documents")} title={<span id="docs-title">{t("home.featuredDocuments")}</span>} description={t("home.featuredDocumentsLead")} />
            </div>
            {docs.length > 0 ? (
              <div className="space-y-3">
                {docs.map((d) => (
                  <DocumentCard key={d.slug} doc={d} locale={locale} />
                ))}
                <Link href="/documents" className={cn(buttonVariants({ variant: "link" }), "mt-2")}>
                  {t("common.viewAll")}
                  <ArrowRight aria-hidden />
                </Link>
              </div>
            ) : (
              <EmptyState icon={FileText} title={t("home.noDocuments")} className="bg-background" />
            )}
          </div>
        </div>
      </section>

      {/* Municipalities */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:py-20" aria-labelledby="mun-title">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <SectionHeading eyebrow={t("nav.municipalities")} title={<span id="mun-title">{t("home.municipalitiesTitle")}</span>} description={t("home.municipalitiesLead")} />
          <Link href="/municipalities" className={buttonVariants({ variant: "outline" })}>
            <MapPin aria-hidden />
            {t("home.municipalitiesCta")}
          </Link>
        </div>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
          {municipalities.map((m) => (
            <li key={m.slug}>
              <Link
                href={`/municipalities/${m.slug}`}
                className="group flex h-full flex-col rounded-md border bg-card p-3 transition-colors hover:border-pst-red hover:bg-pst-red-50"
              >
                <span className="font-display text-xs font-bold text-pst-red">{m.code}</span>
                <span className="font-display text-lg font-bold leading-tight group-hover:text-pst-red">{m.name}</span>
                {m.capital && <span className="text-xs text-muted-foreground">{m.capital}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Join + voice */}
      <section className="relative overflow-hidden bg-gradient-to-br from-pst-red via-pst-red-700 to-pst-red-900 text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:py-16 lg:grid-cols-[1.3fr_1fr] lg:items-center">
          <div className="flex items-start gap-5">
            <Emblem size={84} className="hidden shrink-0 ring-4 ring-white/20 sm:block" />
            <div>
              <Stars className="mb-2 text-lg" />
              <h2 className="text-4xl font-extrabold uppercase leading-none sm:text-5xl">{t("home.joinTitle")}</h2>
              <p className="mt-3 max-w-xl text-white/90">{t("home.joinLead")}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/join" className={cn(buttonVariants({ variant: "gold", size: "lg" }), "font-bold uppercase tracking-wide")}>
                  {t("home.joinCta")}
                  <ArrowRight aria-hidden />
                </Link>
                <Link href="/membership-status" className={buttonVariants({ variant: "outline-light", size: "lg" })}>
                  <Search aria-hidden />
                  {t("home.checkStatus")}
                </Link>
              </div>
            </div>
          </div>
          <div className="rounded-xl bg-pst-ink/40 p-6 ring-1 ring-white/15 backdrop-blur">
            <Megaphone className="mb-3 size-8 text-pst-gold" aria-hidden />
            <h2 className="text-2xl font-extrabold uppercase">{t("home.voiceTitle")}</h2>
            <p className="mt-2 text-sm text-white/85">{t("home.voiceLead")}</p>
            <Link href="/voice" className={cn(buttonVariants({ variant: "outline-light" }), "mt-4")}>
              {t("nav.voice")}
              <ArrowRight aria-hidden />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
