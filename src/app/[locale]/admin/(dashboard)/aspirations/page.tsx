import type { Metadata } from "next";
import { z } from "zod";
import { getLocale, getTranslations } from "next-intl/server";
import { EyeOff, Megaphone, MessageSquare, Paperclip } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { booleanish, optionalText } from "@/lib/validation/common";
import { ASPIRATION_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from "@/lib/validation/content";
import { listAspirations } from "@/server/services/aspiration.service";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { Pagination, pageHref } from "@/components/ui/pagination";
import { AspirationFilters } from "@/components/admin/aspirations/aspiration-filters";
import { PriorityBadge, TicketStatusBadge } from "@/components/admin/aspirations/badges";
import { flatParams, pageParam, parseLenient, type SearchParams } from "@/components/admin/members/query";
import { formatNumber, formatRelative } from "@/lib/format";

const PAGE_SIZE = 25;

const filterSchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  category: z.enum(ASPIRATION_CATEGORIES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  assignedToMe: booleanish,
  q: optionalText(100),
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("aspirations");
  return { title: t("title") };
}

export default async function AspirationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const auth = await requireAdmin("aspiration:read", "/admin/aspirations");
  const t = await getTranslations("aspirations");
  const tc = await getTranslations("common");
  const locale = await getLocale();

  const params = flatParams(await searchParams);
  const f = parseLenient(filterSchema, params);
  const page = pageParam(params);
  const { items, total } = await listAspirations(auth, f, (page - 1) * PAGE_SIZE, PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = Object.keys(params).some((k) => k !== "page");

  const submitter = (a: (typeof items)[number]) => (a.isAnonymous ? t("anonymous") : (a.name ?? "—"));

  return (
    <>
      <PageHeader title={t("title")} description={t("listDescription")} />
      <AspirationFilters />
      <p className="mb-2 text-sm text-muted-foreground">{tc("pagination.total", { count: formatNumber(total, locale) })}</p>

      {items.length === 0 ? (
        <EmptyState icon={Megaphone} title={filtered ? tc("states.noResults") : t("empty.title")} description={filtered ? undefined : t("empty.description")} />
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {items.map((a) => (
              <li key={a.id}>
                <Link href={`/admin/aspirations/${a.id}`} className="block rounded-lg border bg-card p-3 hover:bg-muted/50">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">{a.subject}</p>
                    <TicketStatusBadge status={a.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <span className="font-mono">{a.ticketNumber}</span> · {tc(`enums.aspirationCategory.${a.category}`)} · {formatRelative(a.createdAt, locale)}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <PriorityBadge priority={a.priority} />
                    {a.municipality && <span>{a.municipality.name}</span>}
                    {a.assignedTo && <span>→ {a.assignedTo.name}</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  <TH>{t("fields.subject")}</TH>
                  <TH>{t("fields.category")}</TH>
                  <TH>{t("fields.submitter")}</TH>
                  <TH>{t("fields.priority")}</TH>
                  <TH>{t("fields.status")}</TH>
                  <TH>{t("fields.assignedTo")}</TH>
                  <TH>{t("fields.received")}</TH>
                </tr>
              </THead>
              <TBody>
                {items.map((a) => (
                  <TR key={a.id} className={a.status === "NEW" ? "font-medium" : undefined}>
                    <TD>
                      <Link href={`/admin/aspirations/${a.id}`} className="block max-w-80 hover:text-primary">
                        <span className="block truncate font-semibold">{a.subject}</span>
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-mono">{a.ticketNumber}</span>
                          {a.attachments.length > 0 && (
                            <span className="inline-flex items-center gap-0.5" title={t("attachments")}>
                              <Paperclip className="size-3" aria-hidden />
                              {a.attachments.length}
                            </span>
                          )}
                          {a._count.notes > 0 && (
                            <span className="inline-flex items-center gap-0.5" title={t("notes.title")}>
                              <MessageSquare className="size-3" aria-hidden />
                              {a._count.notes}
                            </span>
                          )}
                        </span>
                      </Link>
                    </TD>
                    <TD>{tc(`enums.aspirationCategory.${a.category}`)}</TD>
                    <TD>
                      <span className="inline-flex items-center gap-1">
                        {a.isAnonymous && <EyeOff className="size-3.5 text-muted-foreground" aria-hidden />}
                        {submitter(a)}
                      </span>
                      {a.municipality && <span className="block text-xs text-muted-foreground">{a.municipality.name}</span>}
                    </TD>
                    <TD>
                      <PriorityBadge priority={a.priority} />
                    </TD>
                    <TD>
                      <TicketStatusBadge status={a.status} />
                    </TD>
                    <TD className="text-muted-foreground">{a.assignedTo?.name ?? "—"}</TD>
                    <TD className="whitespace-nowrap text-muted-foreground">{formatRelative(a.createdAt, locale)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
          <Pagination
            className="mt-4"
            page={Math.min(page, pageCount)}
            pageCount={pageCount}
            hrefFor={(p) => pageHref(`/${locale}/admin/aspirations`, params, p)}
            labels={{ previous: tc("actions.previous"), next: tc("actions.next"), page: (p, n) => tc("pagination.page", { page: p, total: n }) }}
          />
        </>
      )}
    </>
  );
}
