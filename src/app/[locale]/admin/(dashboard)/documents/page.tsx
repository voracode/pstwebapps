import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth/server";
import { can } from "@/lib/security/rbac";
import { listDocumentsAdmin } from "@/server/services/content.service";
import { DOCUMENT_TYPES } from "@/lib/validation/content";
import { PageHeader } from "@/components/admin/page-header";
import { Label, NativeSelect } from "@/components/ui/form-controls";
import { Pagination, pageHref } from "@/components/ui/pagination";
import { FilterForm, oneOf, pageNumber, sp } from "@/components/admin/cms/filter-form";
import { DocumentsManager, type DocumentRow } from "@/components/admin/cms/documents-manager";

const PAGE_SIZE = 25;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("cms.documents");
  return { title: t("title") };
}

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const auth = await requireAdmin("post:read");
  const params = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations("cms");
  const tc = await getTranslations("common");

  const type = oneOf(sp(params, "type"), DOCUMENT_TYPES);
  const page = pageNumber(sp(params, "page"));
  const { items, total } = await listDocumentsAdmin({ type }, (page - 1) * PAGE_SIZE, PAGE_SIZE);
  const base = `/${locale}/admin/documents`;

  const rows: DocumentRow[] = items.map((d) => ({
    id: d.id,
    type: d.type,
    slug: d.slug,
    versionLabel: d.versionLabel,
    isPublic: d.isPublic,
    isFeatured: d.isFeatured,
    publishedAt: d.publishedAt,
    downloadCount: d.downloadCount,
    translations: d.translations.map((x) => ({ locale: x.locale, title: x.title, description: x.description, fileId: x.fileId, fileUrl: x.fileUrl })),
  }));

  return (
    <>
      <PageHeader title={t("documents.title")} description={t("documents.description")} />
      <FilterForm action={base} submitLabel={tc("actions.filter")} clearLabel={tc("actions.clear")} showClear={!!type}>
        <div className="space-y-1.5">
          <Label htmlFor="f-type">{t("documents.type")}</Label>
          <NativeSelect id="f-type" name="type" defaultValue={type ?? ""}>
            <option value="">{tc("states.all")}</option>
            {DOCUMENT_TYPES.map((v) => (
              <option key={v} value={v}>
                {tc(`enums.documentType.${v}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
      </FilterForm>
      <DocumentsManager documents={rows} canWrite={can(auth.user.role, "document:write")} />
      <Pagination
        className="mt-4"
        page={page}
        pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
        hrefFor={(n) => pageHref(base, params, n)}
        labels={{ previous: tc("actions.previous"), next: tc("actions.next"), page: (p, n) => tc("pagination.page", { page: p, total: n }) }}
      />
    </>
  );
}
