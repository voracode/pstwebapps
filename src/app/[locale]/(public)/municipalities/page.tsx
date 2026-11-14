import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, Building, MapPin } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/primitives";
import { PageBody, PageHeader } from "@/components/public/page-header";
import { MapLoader } from "@/components/public/map-loader";
import { alternatesFor, asLocale } from "@/components/public/locale";
import { municipalDirectory } from "@/server/services/content.service";

export const revalidate = 300;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "public.municipalities" });
  return { title: t("title"), description: t("lead"), alternates: alternatesFor(locale, "/municipalities") };
}

export default async function MunicipalitiesPage({ params }: Props) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("public");
  const list = await municipalDirectory(locale);

  const points = list
    .filter((m) => m.latitude !== null && m.longitude !== null)
    .map((m) => ({
      slug: m.slug,
      name: m.name,
      capital: m.capital,
      latitude: m.latitude!,
      longitude: m.longitude!,
      detailLabel: t("municipalities.details"),
      subtitle: m.capital ? t("municipalities.capital", { capital: m.capital }) : undefined,
    }));

  return (
    <>
      <PageHeader title={t("municipalities.title")} lead={t("municipalities.lead")} crumbs={[{ label: t("nav.municipalities") }]} />
      <PageBody>
        <section aria-labelledby="map-h" className="mb-12">
          <h2 id="map-h" className="sr-only">
            {t("municipalities.map")}
          </h2>
          <div className="relative z-0 h-[22rem] overflow-hidden rounded-xl border shadow-sm sm:h-[30rem]">
            <MapLoader points={points} label={t("municipalities.map")} />
          </div>
        </section>

        <section aria-labelledby="list-h">
          <h2 id="list-h" className="mb-6 text-3xl font-extrabold uppercase">
            {t("municipalities.list")}
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((m) => (
              <li key={m.slug}>
                <Link
                  href={`/municipalities/${m.slug}`}
                  className="group flex h-full flex-col gap-2 rounded-lg border bg-card p-5 shadow-sm transition hover:border-pst-red hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="rounded bg-pst-red px-2 py-0.5 font-display text-sm font-bold text-white">{m.code}</span>
                    {m.isSpecialRegion && <Badge variant="gold">{t("municipalities.specialRegion")}</Badge>}
                  </div>
                  <span className="font-display text-2xl font-bold leading-tight group-hover:text-pst-red">{m.name}</span>
                  {m.officialName && <span className="text-sm text-muted-foreground">{m.officialName}</span>}
                  <span className="mt-1 space-y-1 text-sm text-muted-foreground">
                    {m.capital && (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="size-4 text-pst-red" aria-hidden />
                        {t("municipalities.capital", { capital: m.capital })}
                      </span>
                    )}
                    <span className="flex items-center gap-1.5">
                      <Building className="size-4 text-pst-red" aria-hidden />
                      {t("municipalities.offices", { count: m.offices.length })}
                    </span>
                  </span>
                  <span className="mt-auto inline-flex items-center gap-1 pt-2 text-sm font-semibold text-pst-red">
                    {t("municipalities.details")}
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </PageBody>
    </>
  );
}
