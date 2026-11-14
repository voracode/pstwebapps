import type { Metadata } from "next";
import { z } from "zod";
import { getLocale, getTranslations } from "next-intl/server";
import { CalendarDays, EyeOff, MapPin, Plus, Users } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { can, isMunicipalScoped } from "@/lib/security/rbac";
import { dateOnly, optionalInt, type AppLocale } from "@/lib/validation/common";
import { EVENT_STATUSES, EVENT_TYPES } from "@/lib/validation/content";
import { pickTranslation } from "@/lib/i18n/pick";
import { listEventsAdmin } from "@/server/services/event.service";
import { municipalityOptions } from "@/server/services/admin-lookup.service";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { Pagination, pageHref } from "@/components/ui/pagination";
import { EventFilters } from "@/components/admin/events/event-filters";
import { EventStatusBadge } from "@/components/admin/events/badges";
import { flatParams, pageParam, parseLenient, type SearchParams } from "@/components/admin/members/query";
import { formatDateTime, formatNumber } from "@/lib/format";

const PAGE_SIZE = 20;

const filterSchema = z.object({
  type: z.enum(EVENT_TYPES).optional(),
  status: z.enum(EVENT_STATUSES).optional(),
  municipalityId: optionalInt,
  from: dateOnly.optional(),
  to: dateOnly.optional(),
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events");
  return { title: t("title") };
}

export default async function EventsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const auth = await requireAdmin("event:read", "/admin/events");
  const t = await getTranslations("events");
  const tc = await getTranslations("common");
  const locale = (await getLocale()) as AppLocale;

  const params = flatParams(await searchParams);
  const f = parseLenient(filterSchema, params);
  const page = pageParam(params);
  // "to" is inclusive: shift to the end of that day in Dili (UTC+9).
  const from = f.from ? new Date(f.from.getTime() - 9 * 3_600_000) : undefined;
  const to = f.to ? new Date(f.to.getTime() + 15 * 3_600_000 - 1) : undefined;
  const scoped = isMunicipalScoped(auth.user);

  const [{ items, total }, municipalities] = await Promise.all([
    listEventsAdmin(auth, { type: f.type, status: f.status, municipalityId: f.municipalityId, from, to }, (page - 1) * PAGE_SIZE, PAGE_SIZE),
    scoped ? Promise.resolve(null) : municipalityOptions(),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = Object.keys(params).some((k) => k !== "page");
  const canWrite = can(auth.user.role, "event:write");

  const rows = items.map((e) => ({ ...e, title: pickTranslation(e.translations, locale)?.title ?? e.slug }));

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("listDescription")}
        actions={
          canWrite && (
            <Link href="/admin/events/new" className={buttonVariants()}>
              <Plus />
              {t("new")}
            </Link>
          )
        }
      />
      <EventFilters municipalities={municipalities} />

      <p className="mb-2 text-sm text-muted-foreground">{tc("pagination.total", { count: formatNumber(total, locale) })}</p>

      {rows.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={filtered ? tc("states.noResults") : t("empty.title")}
          description={filtered ? undefined : t("empty.description")}
          action={
            !filtered && canWrite ? (
              <Link href="/admin/events/new" className={buttonVariants({ size: "sm" })}>
                <Plus />
                {t("new")}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {rows.map((e) => (
              <li key={e.id}>
                <Link href={`/admin/events/${e.id}`} className="block rounded-lg border bg-card p-3 hover:bg-muted/50">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">{e.title}</p>
                    <EventStatusBadge status={e.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDateTime(e.startsAt, locale)} · {tc(`enums.eventType.${e.type}`)}
                  </p>
                  <p className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    {e.municipality && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3" aria-hidden />
                        {e.municipality.name}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-3" aria-hidden />
                      {formatNumber(e.attendanceCount, locale)}
                    </span>
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  <TH>{t("fields.title")}</TH>
                  <TH>{t("fields.startsAt")}</TH>
                  <TH>{t("fields.place")}</TH>
                  <TH>{t("fields.type")}</TH>
                  <TH>{t("fields.status")}</TH>
                  <TH className="text-right">{t("fields.attendance")}</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((e) => (
                  <TR key={e.id}>
                    <TD>
                      <Link href={`/admin/events/${e.id}`} className="inline-flex items-center gap-2 font-semibold hover:text-primary">
                        <span className="max-w-72 truncate">{e.title}</span>
                        {!e.isPublic && <EyeOff className="size-3.5 text-muted-foreground" aria-label={t("fields.private")} />}
                      </Link>
                    </TD>
                    <TD className="whitespace-nowrap">{formatDateTime(e.startsAt, locale)}</TD>
                    <TD>
                      {e.municipality?.name ?? t("national")}
                      {e.venue && <span className="block max-w-56 truncate text-xs text-muted-foreground">{e.venue}</span>}
                    </TD>
                    <TD>{tc(`enums.eventType.${e.type}`)}</TD>
                    <TD>
                      <EventStatusBadge status={e.status} />
                    </TD>
                    <TD className="text-right tabular-nums">
                      {formatNumber(e.attendanceCount, locale)}
                      {e.capacity ? <span className="text-muted-foreground"> / {formatNumber(e.capacity, locale)}</span> : null}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
          <Pagination
            className="mt-4"
            page={Math.min(page, pageCount)}
            pageCount={pageCount}
            hrefFor={(p) => pageHref(`/${locale}/admin/events`, params, p)}
            labels={{ previous: tc("actions.previous"), next: tc("actions.next"), page: (p, n) => tc("pagination.page", { page: p, total: n }) }}
          />
        </>
      )}
    </>
  );
}
