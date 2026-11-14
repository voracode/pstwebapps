import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BookOpen, FileText } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/primitives";
import { PageBody, PageHeader } from "@/components/public/page-header";
import { AboutNav } from "@/components/public/about-nav";
import { LucideByName } from "@/components/public/lucide-by-name";
import { DocumentCard } from "@/components/public/cards";
import { alternatesFor, asLocale } from "@/components/public/locale";
import { getPageSections } from "@/server/services/public-site.service";
import { listDocumentsPublic } from "@/server/services/content.service";

export const revalidate = 300;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "public.program" });
  return { title: t("title"), description: t("lead"), alternates: alternatesFor(locale, "/about/program") };
}

export default async function ProgramPage({ params }: Props) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("public");
  const [sections, docs] = await Promise.all([getPageSections(locale, ["PROGRAM"]), listDocumentsPublic(locale, { type: "POLITICAL_PROGRAM" }, 0, 2)]);

  return (
    <>
      <PageHeader title={t("program.title")} lead={t("program.lead")} crumbs={[{ label: t("nav.about"), href: "/about" }, { label: t("nav.program") }]} />
      <AboutNav current="/about/program" />
      <PageBody>
        {sections.length > 0 ? (
          <ol className="grid gap-5 md:grid-cols-2">
            {sections.map((s, i) => (
              <li key={s.id} className="relative flex flex-col overflow-hidden rounded-xl border bg-card p-6 shadow-sm">
                <span aria-hidden className="absolute right-4 top-2 font-display text-6xl font-extrabold text-pst-red/10">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="mb-4 flex size-12 items-center justify-center rounded-lg bg-pst-red text-white">
                  <LucideByName name={s.icon ?? undefined} className="size-6" />
                </span>
                <h2 className="mb-3 text-2xl font-extrabold uppercase leading-tight">{s.title}</h2>
                <div className="prose-pst prose-sm" dangerouslySetInnerHTML={{ __html: s.contentHtml }} />
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState
            icon={BookOpen}
            title={t("program.emptyTitle")}
            description={t("program.emptyBody")}
            action={
              <Link href="/documents?type=POLITICAL_PROGRAM" className={buttonVariants({ variant: "outline" })}>
                <FileText aria-hidden />
                {t("program.seeDocuments")}
              </Link>
            }
          />
        )}
        {docs.items.length > 0 && (
          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {docs.items.map((d) => (
              <DocumentCard key={d.slug} doc={d} locale={locale} />
            ))}
          </div>
        )}
      </PageBody>
    </>
  );
}
