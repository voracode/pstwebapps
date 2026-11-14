import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Activity, CheckCircle2, Clock, Eye, Megaphone, ServerCrash, Users, XCircle } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { can } from "@/lib/security/rbac";
import { dashboardStats, systemHealth } from "@/server/services/dashboard.service";
import { municipalityName } from "@/server/services/admin-lookup.service";
import { Link } from "@/i18n/navigation";
import { PageHeader, StatTile } from "@/components/admin/page-header";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from "@/components/ui/primitives";
import { GenderChart, MunicipalityChart, RegistrationsChart, SimpleBarChart } from "@/components/admin/dashboard/charts";
import { formatNumber, formatRelative } from "@/lib/format";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard");
  return { title: t("title") };
}

const OPEN_TICKETS = ["NEW", "ACKNOWLEDGED", "IN_REVIEW", "FORWARDED"];
const TICKET_ORDER = ["NEW", "ACKNOWLEDGED", "IN_REVIEW", "FORWARDED", "RESOLVED", "CLOSED", "SPAM"] as const;
const AGE_GROUPS = ["17-24", "25-34", "35-44", "45-54", "55-64", "65+"];

export default async function DashboardPage() {
  const auth = await requireAdmin("dashboard:read", "/admin");
  const t = await getTranslations("dashboard");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const role = auth.user.role;
  const showHealth = can(role, "system:health");

  const [stats, health] = await Promise.all([dashboardStats(auth), showHealth ? systemHealth() : Promise.resolve(null)]);
  const scopeName = typeof stats.scope === "object" ? await municipalityName(stats.scope.municipalityId) : null;
  const m = stats.members;
  const n = (x: number) => formatNumber(x, locale);

  const verified = m.byStatus.VERIFIED ?? 0;
  const pending = m.byStatus.PENDING ?? 0;
  const openAspirations = OPEN_TICKETS.reduce((a, s) => a + (stats.aspirations[s] ?? 0), 0);
  const last30 = m.registrationsLast30Days.reduce((a, d) => a + d.count, 0);
  const genderTotal = Object.values(m.byGender).reduce((a, b) => a + b, 0);
  const ageTotal = m.byAgeGroup.reduce((a, b) => a + b.count, 0);
  const aspTotal = Object.values(stats.aspirations).reduce((a, b) => a + b, 0);
  const canMembers = can(role, "member:read");
  const canAsp = can(role, "aspiration:read");

  const byMun = m.byMunicipality
    .map((r) => ({ name: r.name, verified: r.verified, pending: r.pending, other: Math.max(0, r.total - r.verified - r.pending) }))
    .filter((r) => stats.scope !== "national" || r.verified + r.pending + r.other > 0 || m.total === 0);

  const empty = (text: string) => <p className="flex h-40 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">{text}</p>;

  return (
    <>
      <PageHeader title={t("title")} description={scopeName ? t("scopeMunicipality", { name: scopeName }) : t("scopeNational")} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={t("kpi.total")} value={n(m.total)} icon={Users} tone="dark" hint={t("kpi.last30", { count: n(last30) })} />
        <StatTile label={t("kpi.verified")} value={n(verified)} icon={CheckCircle2} tone="red" hint={m.total ? t("kpi.share", { pct: Math.round((verified / m.total) * 100) }) : undefined} />
        <StatTile
          label={t("kpi.pending")}
          value={n(pending)}
          icon={Clock}
          tone="gold"
          hint={m.oldestPendingSince ? t("kpi.oldest", { when: formatRelative(m.oldestPendingSince, locale) }) : t("kpi.noneWaiting")}
        />
        <StatTile label={t("kpi.aspirationsOpen")} value={n(openAspirations)} icon={Megaphone} hint={t("kpi.aspirationsNew", { count: n(stats.aspirations.NEW ?? 0) })} />
      </div>

      {(canMembers || canAsp) && (pending > 0 || (stats.aspirations.NEW ?? 0) > 0) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {canMembers && pending > 0 && (
            <Link href="/admin/members?status=PENDING" className="rounded-full border border-amber-400 bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted">
              {t("quick.reviewPending", { count: pending })} →
            </Link>
          )}
          {canAsp && (stats.aspirations.NEW ?? 0) > 0 && (
            <Link href="/admin/aspirations?status=NEW" className="rounded-full border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted">
              {t("quick.newAspirations", { count: stats.aspirations.NEW ?? 0 })} →
            </Link>
          )}
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>{t("charts.registrations")}</CardTitle>
            <CardDescription>{t("charts.registrationsHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            {last30 === 0 ? empty(t("charts.noRegistrations")) : <RegistrationsChart data={m.registrationsLast30Days} label={t("charts.registrations")} seriesLabel={t("charts.registrationsSeries")} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("charts.gender")}</CardTitle>
            <CardDescription>{t("charts.verifiedOnly")}</CardDescription>
          </CardHeader>
          <CardContent>
            {genderTotal === 0 ? (
              empty(t("charts.noVerified"))
            ) : (
              <GenderChart
                label={t("charts.gender")}
                data={(["MALE", "FEMALE"] as const).map((g) => ({ name: tc(`enums.gender.${g}`), value: m.byGender[g] ?? 0 }))}
              />
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>{t("charts.municipality")}</CardTitle>
            <CardDescription>{t("charts.municipalityHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            {m.total === 0 ? (
              empty(t("charts.noMembers"))
            ) : (
              <MunicipalityChart
                data={byMun}
                label={t("charts.municipality")}
                labels={{ verified: tc("enums.memberStatus.VERIFIED"), pending: tc("enums.memberStatus.PENDING"), other: t("charts.otherStatus") }}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("charts.age")}</CardTitle>
            <CardDescription>{t("charts.verifiedOnly")}</CardDescription>
          </CardHeader>
          <CardContent>
            {ageTotal === 0 ? (
              empty(t("charts.noVerified"))
            ) : (
              <SimpleBarChart
                label={t("charts.age")}
                seriesLabel={t("charts.membersSeries")}
                data={AGE_GROUPS.map((g) => ({ name: g, value: m.byAgeGroup.find((a) => a.group === g)?.count ?? 0 }))}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("charts.aspirations")}</CardTitle>
          </CardHeader>
          <CardContent>
            {aspTotal === 0 ? (
              empty(t("charts.noAspirations"))
            ) : (
              <SimpleBarChart
                horizontal
                label={t("charts.aspirations")}
                seriesLabel={t("charts.ticketsSeries")}
                data={TICKET_ORDER.map((s) => ({ name: tc(`enums.ticketStatus.${s}`), value: stats.aspirations[s] ?? 0 }))}
              />
            )}
          </CardContent>
        </Card>

        {stats.scope === "national" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="size-5" aria-hidden />
                {t("topPosts.title")}
              </CardTitle>
              <CardDescription>{t("topPosts.hint")}</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.topPosts30Days.length === 0 ? (
                empty(t("topPosts.empty"))
              ) : (
                <ol className="space-y-3">
                  {stats.topPosts30Days.map((p, i) => (
                    <li key={p.id} className="flex items-start gap-3 text-sm">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">{i + 1}</span>
                      <span className="min-w-0 flex-1 break-words font-medium">{p.title ?? "—"}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{t("topPosts.views", { count: n(p.views) })}</span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        )}

        {health && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  {health.status === "ok" ? <Activity className="size-5" aria-hidden /> : <ServerCrash className="size-5 text-destructive" aria-hidden />}
                  {t("health.title")}
                </span>
                <Badge variant={health.status === "ok" ? "success" : "danger"}>{health.status === "ok" ? t("health.ok") : t("health.degraded")}</Badge>
              </CardTitle>
              <CardDescription>{t("health.uptime", { hours: Math.floor(health.uptimeSec / 3600) })}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y text-sm">
                {Object.entries(health.checks).map(([name, c]) => (
                  <li key={name} className="flex items-center justify-between gap-3 py-2">
                    <span className="flex items-center gap-2 font-medium">
                      {c.ok ? <CheckCircle2 className="size-4 text-green-600" aria-hidden /> : <XCircle className="size-4 text-destructive" aria-hidden />}
                      {t.has(`health.checks.${name}`) ? t(`health.checks.${name}` as "health.checks.database") : name}
                      <span className="sr-only">{c.ok ? t("health.ok") : t("health.degraded")}</span>
                    </span>
                    <span className="truncate text-right text-xs text-muted-foreground">
                      {c.latencyMs !== undefined ? `${c.latencyMs} ms` : ""}
                      {c.latencyMs !== undefined && c.detail ? " · " : ""}
                      {c.detail ?? ""}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {m.total === 0 && aspTotal === 0 && (
        <EmptyState className="mt-6" icon={Users} title={t("emptyTitle")} description={t("emptyDescription")} />
      )}
    </>
  );
}
