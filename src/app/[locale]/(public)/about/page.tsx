import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, BookOpen, ScrollText, Users } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Alert } from "@/components/ui/primitives";
import { Emblem, Stars } from "@/components/brand/emblem";
import { PageBody, PageHeader } from "@/components/public/page-header";
import { AboutNav } from "@/components/public/about-nav";
import { alternatesFor, asLocale } from "@/components/public/locale";
import { getPageSections } from "@/server/services/public-site.service";

export const revalidate = 300;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "public.about" });
  return { title: t("title"), description: t("lead"), alternates: alternatesFor(locale, "/about") };
}

const GROUPS = [
  { page: "ABOUT", id: "party", label: "sectionAbout" },
  { page: "HISTORY", id: "history", label: "sectionHistory" },
  { page: "IDEOLOGY", id: "ideology", label: "sectionIdeology" },
] as const;

export default async function AboutPage({ params }: Props) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("public");
  const sections = await getPageSections(locale, ["ABOUT", "HISTORY", "IDEOLOGY"]);

  const groups = GROUPS.map((g) => ({ ...g, items: sections.filter((s) => s.page === g.page) })).filter((g) => g.items.length > 0);

  const explore = [
    { href: "/about/program", icon: BookOpen, title: t("nav.program"), body: t("about.programCard") },
    { href: "/about/statute", icon: ScrollText, title: t("nav.statute"), body: t("about.statuteCard") },
    { href: "/about/leadership", icon: Users, title: t("nav.leadership"), body: t("about.leadershipCard") },
  ];

  return (
    <>
      <PageHeader title={t("about.title")} lead={t("about.lead")} crumbs={[{ label: t("nav.about") }]} />
      <AboutNav current="/about" />
      <PageBody>
        {groups.length > 0 ? (
          <div className="grid gap-10 lg:grid-cols-[14rem_1fr]">
            <aside className="hidden lg:block">
              <nav aria-label={t("about.onThisPage")} className="sticky top-24 space-y-2 text-sm">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("about.onThisPage")}</p>
                <ul className="space-y-1 border-l">
                  {groups.map((g) => (
                    <li key={g.id}>
                      <a href={`#${g.id}`} className="-ml-px block border-l-2 border-transparent py-1 pl-3 text-muted-foreground hover:border-pst-red hover:text-foreground">
                        {t(`about.${g.label}`)}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </aside>
            <div className="space-y-14">
              {groups.map((g) => (
                <section key={g.id} id={g.id} aria-labelledby={`${g.id}-h`} className="scroll-mt-24">
                  <p id={`${g.id}-h`} className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-pst-red">
                    <span aria-hidden>★ </span>
                    {t(`about.${g.label}`)}
                  </p>
                  <div className="space-y-10">
                    {g.items.map((s) => (
                      <article key={s.id}>
                        <h2 className="mb-4 text-3xl font-extrabold uppercase">{s.title}</h2>
                        {s.isFallback && (
                          <Alert variant="info" className="mb-4">
                            {t("common.fallbackNotice")}
                          </Alert>
                        )}
                        <div className="prose-pst" dangerouslySetInnerHTML={{ __html: s.contentHtml }} />
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-5 rounded-xl border bg-surface px-6 py-12 text-center">
            <Emblem size={120} />
            <div>
              <p className="font-display text-3xl font-extrabold uppercase">{t("meta.name")}</p>
              <p className="mt-1 flex items-center justify-center gap-2 font-display text-xl font-bold italic text-pst-red" lang="pt">
                <Stars /> Pelo Progresso, Igualdade <Stars />
              </p>
            </div>
            <div className="max-w-lg">
              <p className="font-semibold">{t("about.emptyTitle")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("about.emptyBody")}</p>
            </div>
          </div>
        )}

        <section aria-labelledby="explore-h" className="mt-16">
          <h2 id="explore-h" className="mb-5 text-2xl font-extrabold uppercase">
            {t("about.explore")}
          </h2>
          <ul className="grid gap-4 sm:grid-cols-3">
            {explore.map((e) => (
              <li key={e.href}>
                <Link href={e.href} className="group flex h-full flex-col gap-2 rounded-lg border bg-card p-5 shadow-sm transition hover:border-pst-red hover:shadow-md">
                  <e.icon className="size-7 text-pst-red" aria-hidden />
                  <span className="font-display text-xl font-bold group-hover:text-pst-red">{e.title}</span>
                  <span className="text-sm text-muted-foreground">{e.body}</span>
                  <ArrowRight className="mt-auto size-4 text-pst-red transition-transform group-hover:translate-x-1" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </PageBody>
    </>
  );
}
