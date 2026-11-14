import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarDays } from "lucide-react";
import { EmptyState } from "@/components/ui/primitives";
import { PageBody, PageHeader } from "@/components/public/page-header";
import { EventCard, type EventCardData } from "@/components/public/cards";
import { FilterForm, ListPagination } from "@/components/public/list-controls";
import { alternatesFor, asLocale, enumParam, pageParam } from "@/components/public/locale";
import { formatDate } from "@/lib/format";
import { listEventsPublic } from "@/server/services/event.service";
import { municipalDirectory } from "@/server/services/content.service";

export const revalidate = 300;

const PAGE_SIZE = 30;
const TYPES = ["CONGRESS", "RALLY", "COMMUNITY_DISCUSSION", "POLITICAL_EDUCATION", "MEETING", "OTHER"] as const;

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "public.events" });
  return { title: t("title"), description: t("lead"), alternates: alternatesFor(locale, "/events") };
}

export default async function EventsPage({ params, searchParams }: Props) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const s = await searchParams;
  const t = await getTranslations("public");
  const te = await getTranslations("common.enums.eventType");
  const tg = await getTranslations("common.geo");

  const municipalities = await municipalDirectory(locale);
  const type = enumParam(s.type, TYPES);
  const municipality = enumParam(
    s.municipality,
    municipalities.map((m) => m.slug),
  );
  const page = pageParam(s.page);
  const { items, total } = await listEventsPublic(locale, { type, municipality }, (page - 1) * PAGE_SIZE, PAGE_SIZE);

  // Group by month in Timor-Leste time.
  const groups: { key: string; label: string; items: EventCardData[] }[] = [];
  for (const e of items) {
    const key = formatDate(e.startsAt, "en", { year: "numeric", month: "2-digit" });
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, label: formatDate(e.startsAt, locale, { month: "long", year: "numeric" }), items: [] };
      groups.push(g);
    }
    g.items.push(e);
  }

  return (
    <>
      <PageHeader title={t("events.title")} lead={t("events.lead")} crumbs={[{ label: t("nav.events") }]} />
      <PageBody>
        <FilterForm
          action={`/${locale}/events`}
          hasActive={!!(type || municipality)}
          className="mb-10"
          selects={[
            { name: "type", label: t("events.type"), value: type, options: TYPES.map((v) => ({ value: v, label: te(v) })) },
            { name: "municipality", label: tg("municipality"), value: municipality, options: municipalities.map((m) => ({ value: m.slug, label: m.name })) },
          ]}
        />
        {groups.length > 0 ? (
          <div className="space-y-12">
            {groups.map((g) => (
              <section key={g.key} aria-labelledby={`m-${g.key}`}>
                <h2 id={`m-${g.key}`} className="mb-4 flex items-center gap-3 text-2xl font-extrabold uppercase first-letter:uppercase">
                  <span className="h-6 w-1.5 rounded bg-pst-red" aria-hidden />
                  {g.label}
                </h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {g.items.map((e) => (
                    <EventCard key={e.slug} event={e} locale={locale} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <EmptyState icon={CalendarDays} title={t("events.emptyTitle")} description={t("events.emptyBody")} />
        )}
        <ListPagination basePath={`/${locale}/events`} params={s} page={page} total={total} pageSize={PAGE_SIZE} />
      </PageBody>
    </>
  );
}
