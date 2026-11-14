import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Inbox } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { listContactMessages } from "@/server/services/aspiration.service";
import { contactCounts } from "@/server/services/admin-lookup.service";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/ui/primitives";
import { Pagination, pageHref } from "@/components/ui/pagination";
import { MessageList } from "@/components/admin/messages/message-list";
import { flatParams, pageParam, type SearchParams } from "@/components/admin/members/query";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils/cn";

const PAGE_SIZE = 25;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("aspirations.contact");
  return { title: t("title") };
}

export default async function MessagesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin("contact:read", "/admin/messages");
  const t = await getTranslations("aspirations.contact");
  const tc = await getTranslations("common");
  const locale = await getLocale();

  const params = flatParams(await searchParams);
  const view = params.view === "unread" || params.view === "spam" ? params.view : "all";
  const page = pageParam(params);
  const [{ items, total }, counts] = await Promise.all([
    listContactMessages({ unread: view === "unread", spam: view === "spam" }, (page - 1) * PAGE_SIZE, PAGE_SIZE),
    contactCounts(),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const tabs = [
    { key: "all", label: t("tabs.inbox"), count: null as number | null },
    { key: "unread", label: t("tabs.unread"), count: counts.unread },
    { key: "spam", label: t("tabs.spam"), count: counts.spam },
  ];

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <nav aria-label={t("title")} className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1">
        {tabs.map((tab) => {
          const active = view === tab.key;
          return (
            <Link
              key={tab.key}
              href={tab.key === "all" ? "/admin/messages" : `/admin/messages?view=${tab.key}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium",
                active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
              )}
            >
              {tab.label}
              {tab.count !== null && (
                <span className={cn("rounded-full px-1.5 text-xs tabular-nums", active ? "bg-white/20" : "bg-muted text-muted-foreground")}>{formatNumber(tab.count, locale)}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {items.length === 0 ? (
        <EmptyState icon={Inbox} title={view === "unread" ? t("empty.unread") : view === "spam" ? t("empty.spam") : t("empty.inbox")} />
      ) : (
        <>
          <MessageList items={items} />
          <Pagination
            className="mt-4"
            page={Math.min(page, pageCount)}
            pageCount={pageCount}
            hrefFor={(p) => pageHref(`/${locale}/admin/messages`, params, p)}
            labels={{ previous: tc("actions.previous"), next: tc("actions.next"), page: (p, n) => tc("pagination.page", { page: p, total: n }) }}
          />
        </>
      )}
    </>
  );
}
