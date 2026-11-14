import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { FileText } from "lucide-react";
import { EmptyState } from "@/components/ui/primitives";
import { PageBody, PageHeader } from "@/components/public/page-header";
import { DocumentCard } from "@/components/public/cards";
import { FilterForm, ListPagination, ResultCount } from "@/components/public/list-controls";
import { alternatesFor, asLocale, enumParam, pageParam } from "@/components/public/locale";
import { listDocumentsPublic } from "@/server/services/content.service";

export const revalidate = 300;

const PAGE_SIZE = 12;
const TYPES = ["STATUTE", "POLITICAL_PROGRAM", "MANIFESTO", "BULLETIN", "LEGISLATION", "RESOLUTION", "REPORT", "OTHER"] as const;

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "public.documents" });
  return { title: t("title"), description: t("lead"), alternates: alternatesFor(locale, "/documents") };
}

export default async function DocumentsPage({ params, searchParams }: Props) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const s = await searchParams;
  const t = await getTranslations("public");
  const te = await getTranslations("common.enums.documentType");
  const type = enumParam(s.type, TYPES);
  const page = pageParam(s.page);
  const { items, total } = await listDocumentsPublic(locale, { type }, (page - 1) * PAGE_SIZE, PAGE_SIZE);

  return (
    <>
      <PageHeader title={t("documents.title")} lead={t("documents.lead")} crumbs={[{ label: t("nav.documents") }]} />
      <PageBody>
        <FilterForm
          action={`/${locale}/documents`}
          hasActive={!!type}
          className="mb-8"
          selects={[{ name: "type", label: t("documents.type"), value: type, options: TYPES.map((v) => ({ value: v, label: te(v) })) }]}
        />
        {type && <ResultCount>{t("common.results", { count: total })}</ResultCount>}
        {items.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {items.map((d) => (
              <DocumentCard key={d.slug} doc={d} locale={locale} />
            ))}
          </div>
        ) : (
          <EmptyState icon={FileText} title={t("documents.emptyTitle")} description={t("documents.emptyBody")} />
        )}
        <ListPagination basePath={`/${locale}/documents`} params={s} page={page} total={total} pageSize={PAGE_SIZE} />
      </PageBody>
    </>
  );
}
