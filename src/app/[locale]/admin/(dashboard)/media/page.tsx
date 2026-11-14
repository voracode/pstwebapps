import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth/server";
import { listMedia } from "@/server/services/content.service";
import { PageHeader } from "@/components/admin/page-header";
import { Input, Label, NativeSelect } from "@/components/ui/form-controls";
import { Pagination, pageHref } from "@/components/ui/pagination";
import { FilterForm, oneOf, pageNumber, sp } from "@/components/admin/cms/filter-form";
import { MediaLibrary } from "@/components/admin/cms/media-library";
import { MEDIA_KINDS, type MediaItem } from "@/components/admin/cms/media-types";

const PAGE_SIZE = 36;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("cms.media");
  return { title: t("title") };
}

export default async function MediaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin("media:write");
  const params = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations("cms");
  const tc = await getTranslations("common");

  const kind = oneOf(sp(params, "kind"), MEDIA_KINDS);
  const q = sp(params, "q")?.slice(0, 100);
  const page = pageNumber(sp(params, "page"));
  const { items, total } = await listMedia({ kind, q }, (page - 1) * PAGE_SIZE, PAGE_SIZE);
  const base = `/${locale}/admin/media`;

  return (
    <>
      <PageHeader title={t("media.title")} description={t("media.description")} />
      <FilterForm action={base} submitLabel={tc("actions.filter")} clearLabel={tc("actions.clear")} showClear={!!(kind || q)}>
        <div className="space-y-1.5 sm:col-span-1 lg:col-span-2">
          <Label htmlFor="f-q">{tc("actions.search")}</Label>
          <Input id="f-q" name="q" type="search" defaultValue={q ?? ""} placeholder={t("media.searchPlaceholder")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-kind">{t("media.kind")}</Label>
          <NativeSelect id="f-kind" name="kind" defaultValue={kind ?? ""}>
            <option value="">{tc("states.all")}</option>
            {MEDIA_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`media.kinds.${k}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
      </FilterForm>
      {total > 0 && <p className="mb-2 text-sm text-muted-foreground">{tc("pagination.total", { count: total })}</p>}
      <MediaLibrary items={items as MediaItem[]} canWrite />
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
