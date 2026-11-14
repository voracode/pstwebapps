import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { FileText, Pin, Plus, Star } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { can } from "@/lib/security/rbac";
import { db } from "@/lib/db";
import { listPostsAdmin } from "@/server/services/post.service";
import { POST_TYPES, PUBLISH_STATUSES } from "@/lib/validation/content";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Input, Label, NativeSelect } from "@/components/ui/form-controls";
import { Badge, EmptyState, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { Pagination, pageHref } from "@/components/ui/pagination";
import { FilterForm, oneOf, pageNumber, sp } from "@/components/admin/cms/filter-form";
import { PublishStatusBadge } from "@/components/admin/cms/status-badge";
import { pickRow } from "@/components/admin/cms/form-helpers";
import { formatDateTime } from "@/lib/format";

const PAGE_SIZE = 20;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("cms.posts");
  return { title: t("title") };
}

export default async function PostsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const auth = await requireAdmin("post:read");
  const params = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations("cms");
  const tc = await getTranslations("common");

  const filters = {
    type: oneOf(sp(params, "type"), POST_TYPES),
    status: oneOf(sp(params, "status"), PUBLISH_STATUSES),
    categoryId: sp(params, "categoryId")?.slice(0, 40),
    q: sp(params, "q")?.slice(0, 100),
  };
  const page = pageNumber(sp(params, "page"));

  const [{ items, total }, categories] = await Promise.all([
    listPostsAdmin(filters, (page - 1) * PAGE_SIZE, PAGE_SIZE),
    db.category.findMany({ orderBy: { sortOrder: "asc" }, include: { translations: true } }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const base = `/${locale}/admin/posts`;
  const hasFilters = Object.values(filters).some(Boolean);
  const canWrite = can(auth.user.role, "post:write");

  return (
    <>
      <PageHeader
        title={t("posts.title")}
        description={t("posts.description")}
        actions={
          canWrite && (
            <Link href="/admin/posts/new" className={buttonVariants()}>
              <Plus aria-hidden />
              {t("posts.new")}
            </Link>
          )
        }
      />

      <FilterForm action={base} submitLabel={tc("actions.filter")} clearLabel={tc("actions.clear")} showClear={hasFilters}>
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-1 xl:col-span-2">
          <Label htmlFor="f-q">{tc("actions.search")}</Label>
          <Input id="f-q" name="q" type="search" defaultValue={filters.q ?? ""} placeholder={t("posts.searchPlaceholder")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-type">{t("posts.type")}</Label>
          <NativeSelect id="f-type" name="type" defaultValue={filters.type ?? ""}>
            <option value="">{tc("states.all")}</option>
            {POST_TYPES.map((v) => (
              <option key={v} value={v}>
                {tc(`enums.postType.${v}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-status">{t("posts.status")}</Label>
          <NativeSelect id="f-status" name="status" defaultValue={filters.status ?? ""}>
            <option value="">{tc("states.all")}</option>
            {PUBLISH_STATUSES.map((v) => (
              <option key={v} value={v}>
                {tc(`enums.publishStatus.${v}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-cat">{t("posts.category")}</Label>
          <NativeSelect id="f-cat" name="categoryId" defaultValue={filters.categoryId ?? ""}>
            <option value="">{tc("states.all")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {pickRow(c.translations, locale)?.name ?? c.key}
              </option>
            ))}
          </NativeSelect>
        </div>
      </FilterForm>

      {items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={hasFilters ? tc("states.noResults") : t("posts.empty")}
          description={hasFilters ? undefined : t("posts.emptyHint")}
          action={
            canWrite && !hasFilters ? (
              <Link href="/admin/posts/new" className={buttonVariants()}>
                <Plus aria-hidden />
                {t("posts.new")}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <p className="mb-2 text-sm text-muted-foreground">{tc("pagination.total", { count: total })}</p>
          <Table>
            <THead>
              <tr>
                <TH>{t("posts.titleCol")}</TH>
                <TH>{t("posts.type")}</TH>
                <TH>{t("posts.status")}</TH>
                <TH className="hidden md:table-cell">{t("posts.category")}</TH>
                <TH className="hidden lg:table-cell">{t("posts.languages")}</TH>
                <TH className="hidden sm:table-cell">{t("posts.updated")}</TH>
              </tr>
            </THead>
            <TBody>
              {items.map((p) => {
                const tr = pickRow(p.translations, locale);
                const cat = p.category ? pickRow(p.category.translations, locale)?.name ?? p.category.key : null;
                const fallback = tr && tr.locale !== locale.toUpperCase();
                return (
                  <TR key={p.id}>
                    <TD className="max-w-md">
                      <Link href={`/admin/posts/${p.id}`} className="font-semibold hover:underline">
                        {tr?.title ?? t("posts.untitled")}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        {fallback && <Badge variant="outline">{tr.locale.toLowerCase()}</Badge>}
                        {p.isFeatured && (
                          <span className="inline-flex items-center gap-0.5" title={t("posts.featured")}>
                            <Star className="size-3" aria-hidden />
                            {t("posts.featured")}
                          </span>
                        )}
                        {p.pinnedToHero && (
                          <span className="inline-flex items-center gap-0.5" title={t("posts.pinnedToHero")}>
                            <Pin className="size-3" aria-hidden />
                            {t("posts.hero")}
                          </span>
                        )}
                        {p.author && <span>{p.author.name}</span>}
                      </div>
                    </TD>
                    <TD className="whitespace-nowrap">{tc(`enums.postType.${p.type}`)}</TD>
                    <TD>
                      <PublishStatusBadge status={p.status} label={tc(`enums.publishStatus.${p.status}`)} />
                      {p.status === "SCHEDULED" && p.scheduledAt && (
                        <div className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(p.scheduledAt, locale)}</div>
                      )}
                    </TD>
                    <TD className="hidden md:table-cell">{cat ?? "—"}</TD>
                    <TD className="hidden lg:table-cell">
                      <div className="flex gap-1">
                        {p.translations.map((x) => (
                          <Badge key={x.locale} variant="muted">
                            {x.locale.toLowerCase()}
                          </Badge>
                        ))}
                      </div>
                    </TD>
                    <TD className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">{formatDateTime(p.updatedAt, locale)}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          <Pagination
            className="mt-4"
            page={page}
            pageCount={pageCount}
            hrefFor={(n) => pageHref(base, params, n)}
            labels={{ previous: tc("actions.previous"), next: tc("actions.next"), page: (p, total) => tc("pagination.page", { page: p, total }) }}
          />
        </>
      )}
    </>
  );
}
