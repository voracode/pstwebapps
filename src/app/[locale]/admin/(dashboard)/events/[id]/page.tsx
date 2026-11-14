import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { CalendarClock, EyeOff, Globe, MapPin, QrCode, UserRound, Users } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { ApiError } from "@/lib/http";
import { can } from "@/lib/security/rbac";
import { pickTranslation } from "@/lib/i18n/pick";
import type { AppLocale } from "@/lib/validation/common";
import { getEventAdmin, listAttendance } from "@/server/services/event.service";
import { Link } from "@/i18n/navigation";
import { PageHeader, StatTile } from "@/components/admin/page-header";
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { Pagination, pageHref } from "@/components/ui/pagination";
import { EventStatusBadge } from "@/components/admin/events/badges";
import { EventActions } from "@/components/admin/events/event-actions";
import { CheckInConsole } from "@/components/admin/events/check-in-console";
import { flatParams, pageParam, type SearchParams } from "@/components/admin/members/query";
import { formatDateTime, formatNumber, formatTime } from "@/lib/format";

const PAGE_SIZE = 50;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events");
  return { title: t("detailTitle") };
}

export default async function EventDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { id } = await params;
  const auth = await requireAdmin("event:read", `/admin/events/${id}`);
  const t = await getTranslations("events");
  const tc = await getTranslations("common");
  const locale = (await getLocale()) as AppLocale;
  const sp = flatParams(await searchParams);
  const page = pageParam(sp);

  const notFoundGuard = (err: unknown): never => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  };
  const e = await getEventAdmin(auth, id).catch(notFoundGuard);
  const att = await listAttendance(auth, id, (page - 1) * PAGE_SIZE, PAGE_SIZE).catch(notFoundGuard);
  const tr = pickTranslation(e.translations, locale);
  const title = tr?.title ?? e.slug;
  const role = auth.user.role;
  const open = e.status !== "DRAFT" && e.status !== "CANCELLED";
  const canCheckIn = can(role, "attendance:write");
  const pageCount = Math.max(1, Math.ceil(att.total / PAGE_SIZE));
  const n = (x: number) => formatNumber(x, locale);

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href="/admin/events" className="hover:underline">
            {t("title")}
          </Link>
        }
        title={title}
        actions={can(role, "event:write") ? <EventActions eventId={e.id} title={title} attendanceCount={att.total} /> : undefined}
      />

      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-5 text-sm">
          <EventStatusBadge status={e.status} />
          <Badge variant="outline">{tc(`enums.eventType.${e.type}`)}</Badge>
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
            {formatDateTime(e.startsAt, locale)}
            {e.endsAt && <> – {formatDateTime(e.endsAt, locale)}</>}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-4 text-muted-foreground" aria-hidden />
            {[e.venue, e.suco?.name, e.municipality?.name ?? t("national")].filter(Boolean).join(", ")}
          </span>
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            {e.isPublic ? <Globe className="size-4" aria-hidden /> : <EyeOff className="size-4" aria-hidden />}
            {e.isPublic ? t("fields.public") : t("fields.private")}
          </span>
        </CardContent>
        {tr?.summary && <p className="px-5 pb-5 text-sm text-muted-foreground">{tr.summary}</p>}
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={t("summary.total")} value={n(att.total)} icon={Users} tone="dark" hint={e.capacity ? t("summary.ofCapacity", { capacity: n(e.capacity) }) : undefined} />
        <StatTile label={t("summary.members")} value={n(att.summary.members)} icon={QrCode} tone="red" />
        <StatTile label={t("summary.guests")} value={n(att.summary.guests)} icon={UserRound} tone="gold" />
        <StatTile
          label={t("summary.byGender")}
          value={`${n(att.summary.byGender.MALE ?? 0)} / ${n(att.summary.byGender.FEMALE ?? 0)}`}
          hint={`${tc("enums.gender.MALE")} / ${tc("enums.gender.FEMALE")}${att.summary.byGender.UNKNOWN ? ` · ${t("summary.unknown", { count: att.summary.byGender.UNKNOWN })}` : ""}`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div>
          {!canCheckIn ? (
            <Alert variant="info">{t("checkin.noPermission")}</Alert>
          ) : open ? (
            <CheckInConsole eventId={e.id} />
          ) : (
            <Alert variant="warning" title={t("checkin.closedTitle")}>
              {t("checkin.closed", { status: tc(`enums.eventStatus.${e.status}`) })}
            </Alert>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("attendance.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            {att.items.length === 0 ? (
              <EmptyState icon={Users} title={t("attendance.empty")} description={open ? t("attendance.emptyHint") : undefined} />
            ) : (
              <>
                <Table>
                  <THead>
                    <tr>
                      <TH>{t("attendance.name")}</TH>
                      <TH className="hidden sm:table-cell">{t("attendance.gender")}</TH>
                      <TH className="hidden md:table-cell">{t("attendance.method")}</TH>
                      <TH>{t("attendance.time")}</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {att.items.map((a) => {
                      const gender = a.member?.gender ?? a.guestGender;
                      return (
                        <TR key={a.id}>
                          <TD>
                            {a.member ? (
                              can(role, "member:read") ? (
                                <Link href={`/admin/members/${a.member.id}`} className="font-semibold hover:text-primary">
                                  {a.member.fullName}
                                </Link>
                              ) : (
                                <span className="font-semibold">{a.member.fullName}</span>
                              )
                            ) : (
                              <span className="font-semibold">{a.guestName ?? "—"}</span>
                            )}
                            <span className="block text-xs text-muted-foreground">
                              {a.member ? <span className="font-mono">{a.member.memberNumber ?? "—"}</span> : <Badge variant="muted">{t("attendance.guest")}</Badge>}
                            </span>
                          </TD>
                          <TD className="hidden sm:table-cell">{gender ? tc(`enums.gender.${gender}`) : "—"}</TD>
                          <TD className="hidden md:table-cell text-muted-foreground">
                            {t(`attendance.methods.${a.method}`)}
                            {a.recordedBy && <span className="block text-xs">{a.recordedBy.name}</span>}
                          </TD>
                          <TD className="whitespace-nowrap tabular-nums">{formatTime(a.checkedInAt, locale)}</TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
                <Pagination
                  className="mt-4"
                  page={Math.min(page, pageCount)}
                  pageCount={pageCount}
                  hrefFor={(p) => pageHref(`/${locale}/admin/events/${id}`, sp, p)}
                  labels={{ previous: tc("actions.previous"), next: tc("actions.next"), page: (p, total) => tc("pagination.page", { page: p, total }) }}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
