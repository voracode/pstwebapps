import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, MapPin, Users } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/primitives";
import { PageBody, PageHeader } from "@/components/public/page-header";
import { AboutNav } from "@/components/public/about-nav";
import { PersonCard } from "@/components/public/person-card";
import { alternatesFor, asLocale } from "@/components/public/locale";
import { leadershipPublic, listLeadership } from "@/server/services/content.service";

export const revalidate = 300;

type Props = { params: Promise<{ locale: string }> };

const NATIONAL_LEVELS = ["PRESIDENCY", "POLITICAL_COMMISSION", "CENTRAL_COMMITTEE", "NATIONAL_SECRETARIAT", "WING"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "public.leadership" });
  return { title: t("title"), description: t("lead"), alternates: alternatesFor(locale, "/about/leadership") };
}

export default async function LeadershipPage({ params }: Props) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("public");
  const tl = await getTranslations("common.enums.leadershipLevel");
  const people = leadershipPublic(await listLeadership({ activeOnly: true }), locale);

  const groups = NATIONAL_LEVELS.map((level) => ({ level, items: people.filter((p) => p.level === level) })).filter((g) => g.items.length > 0);

  return (
    <>
      <PageHeader title={t("leadership.title")} lead={t("leadership.lead")} crumbs={[{ label: t("nav.about"), href: "/about" }, { label: t("nav.leadership") }]} />
      <AboutNav current="/about/leadership" />
      <PageBody>
        {groups.length > 0 ? (
          <div className="space-y-14">
            {groups.map((g) => (
              <section key={g.level} aria-labelledby={`lvl-${g.level}`}>
                <h2 id={`lvl-${g.level}`} className="mb-6 flex items-center gap-3 text-3xl font-extrabold uppercase">
                  <span className="h-8 w-1.5 rounded bg-pst-red" aria-hidden />
                  {tl(g.level)}
                </h2>
                {g.level === "PRESIDENCY" ? (
                  <div className="grid gap-5 lg:grid-cols-2">
                    {g.items.map((p) => (
                      <PersonCard key={p.id} person={p} featured />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                    {g.items.map((p) => (
                      <PersonCard key={p.id} person={p} />
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        ) : (
          <EmptyState icon={Users} title={t("leadership.emptyTitle")} description={t("leadership.emptyBody")} />
        )}

        <aside className="mt-14 flex flex-col items-start gap-4 rounded-xl bg-pst-ink p-6 text-white sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-extrabold uppercase">
              <MapPin className="size-6 text-pst-gold" aria-hidden />
              {t("leadership.municipalTitle")}
            </h2>
            <p className="mt-1 text-sm text-white/75">{t("leadership.municipalBody")}</p>
          </div>
          <Link href="/municipalities" className={buttonVariants({ variant: "gold" })}>
            {t("nav.municipalities")}
            <ArrowRight aria-hidden />
          </Link>
        </aside>
      </PageBody>
    </>
  );
}
