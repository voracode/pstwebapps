import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ScrollText } from "lucide-react";
import { EmptyState } from "@/components/ui/primitives";
import { PageBody, PageHeader } from "@/components/public/page-header";
import { AboutNav } from "@/components/public/about-nav";
import { DocumentCard } from "@/components/public/cards";
import { alternatesFor, asLocale } from "@/components/public/locale";
import { listDocumentsPublic } from "@/server/services/content.service";

export const revalidate = 300;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "public.statute" });
  return { title: t("title"), description: t("lead"), alternates: alternatesFor(locale, "/about/statute") };
}

export default async function StatutePage({ params }: Props) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("public");
  const te = await getTranslations("common.enums.documentType");
  const [statutes, programs] = await Promise.all([
    listDocumentsPublic(locale, { type: "STATUTE" }, 0, 20),
    listDocumentsPublic(locale, { type: "POLITICAL_PROGRAM" }, 0, 20),
  ]);
  const groups = [
    { key: "STATUTE" as const, items: statutes.items },
    { key: "POLITICAL_PROGRAM" as const, items: programs.items },
  ].filter((g) => g.items.length > 0);

  return (
    <>
      <PageHeader title={t("statute.title")} lead={t("statute.lead")} crumbs={[{ label: t("nav.about"), href: "/about" }, { label: t("nav.statute") }]} />
      <AboutNav current="/about/statute" />
      <PageBody>
        {groups.length > 0 ? (
          <div className="space-y-12">
            {groups.map((g) => (
              <section key={g.key} aria-labelledby={`g-${g.key}`}>
                <h2 id={`g-${g.key}`} className="mb-5 text-3xl font-extrabold uppercase">
                  {te(g.key)}
                </h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {g.items.map((d) => (
                    <DocumentCard key={d.slug} doc={d} locale={locale} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <EmptyState icon={ScrollText} title={t("statute.emptyTitle")} description={t("statute.emptyBody")} />
        )}
      </PageBody>
    </>
  );
}
