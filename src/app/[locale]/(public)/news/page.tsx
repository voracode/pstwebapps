import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Newspaper } from "lucide-react";
import { EmptyState } from "@/components/ui/primitives";
import { PageBody, PageHeader } from "@/components/public/page-header";
import { PostCard } from "@/components/public/cards";
import { FilterForm, ListPagination, ResultCount } from "@/components/public/list-controls";
import { alternatesFor, asLocale, enumParam, pageParam, sp } from "@/components/public/locale";
import { listPostsPublic } from "@/server/services/post.service";
import { listCategoriesPublic } from "@/server/services/public-site.service";

export const revalidate = 300;

const PAGE_SIZE = 12;
const TYPES = ["NEWS", "PRESS_RELEASE", "ARTICLE", "STATEMENT"] as const;

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale } = await params;
  const s = await searchParams;
  const t = await getTranslations({ locale, namespace: "public.news" });
  const filtered = Object.keys(s).some((k) => sp(s[k]));
  return {
    title: t("title"),
    description: t("lead"),
    alternates: alternatesFor(locale, "/news"),
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function NewsPage({ params, searchParams }: Props) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const s = await searchParams;
  const t = await getTranslations("public");
  const te = await getTranslations("common.enums.postType");

  const categories = await listCategoriesPublic(locale);
  const type = enumParam(s.type, TYPES);
  const category = enumParam(
    s.category,
    categories.map((c) => c.key),
  );
  const q = sp(s.q)?.slice(0, 100);
  const page = pageParam(s.page);

  const { items, total } = await listPostsPublic(locale, { type, category, q }, (page - 1) * PAGE_SIZE, PAGE_SIZE);
  const hasActive = !!(type || category || q);

  return (
    <>
      <PageHeader title={t("news.title")} lead={t("news.lead")} crumbs={[{ label: t("nav.news") }]} />
      <PageBody>
        <FilterForm
          action={`/${locale}/news`}
          hasActive={hasActive}
          className="mb-8"
          search={{ name: "q", label: t("news.search"), placeholder: t("news.searchPlaceholder"), value: q }}
          selects={[
            { name: "type", label: t("news.type"), value: type, options: TYPES.map((v) => ({ value: v, label: te(v) })) },
            { name: "category", label: t("news.category"), value: category, options: categories.map((c) => ({ value: c.key, label: c.name })) },
          ]}
        />
        {hasActive && <ResultCount>{t("common.results", { count: total })}</ResultCount>}
        {items.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((p, i) => (
              <PostCard key={p.id} post={p} locale={locale} priority={i < 3 && page === 1} />
            ))}
          </div>
        ) : (
          <EmptyState icon={Newspaper} title={t("news.emptyTitle")} description={t("news.emptyBody")} />
        )}
        <ListPagination basePath={`/${locale}/news`} params={s} page={page} total={total} pageSize={PAGE_SIZE} />
      </PageBody>
    </>
  );
}
