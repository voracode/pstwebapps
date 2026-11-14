import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Megaphone } from "lucide-react";
import { EmptyState } from "@/components/ui/primitives";
import { PageBody, PageHeader } from "@/components/public/page-header";
import { PostCard } from "@/components/public/cards";
import { ListPagination } from "@/components/public/list-controls";
import { alternatesFor, asLocale, pageParam } from "@/components/public/locale";
import { listPostsPublic } from "@/server/services/post.service";

export const revalidate = 300;

const PAGE_SIZE = 12;

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "public.press" });
  return { title: t("title"), description: t("lead"), alternates: alternatesFor(locale, "/press") };
}

export default async function PressPage({ params, searchParams }: Props) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const s = await searchParams;
  const t = await getTranslations("public");
  const page = pageParam(s.page);
  const { items, total } = await listPostsPublic(locale, { type: "PRESS_RELEASE" }, (page - 1) * PAGE_SIZE, PAGE_SIZE);

  return (
    <>
      <PageHeader title={t("press.title")} lead={t("press.lead")} crumbs={[{ label: t("nav.news"), href: "/news" }, { label: t("nav.press") }]} />
      <PageBody>
        {items.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {items.map((p) => (
              <PostCard key={p.id} post={p} locale={locale} variant="row" />
            ))}
          </div>
        ) : (
          <EmptyState icon={Megaphone} title={t("press.emptyTitle")} description={t("press.emptyBody")} />
        )}
        <ListPagination basePath={`/${locale}/press`} params={s} page={page} total={total} pageSize={PAGE_SIZE} />
      </PageBody>
    </>
  );
}
