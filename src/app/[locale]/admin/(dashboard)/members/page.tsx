import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, Upload, Users } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { can } from "@/lib/security/rbac";
import { memberListSchema, MEMBER_STATUSES, type MemberListFilter } from "@/lib/validation/member";
import { listMembers } from "@/server/services/member.service";
import { memberStatusCounts } from "@/server/services/admin-lookup.service";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { Pagination, pageHref } from "@/components/ui/pagination";
import { MemberFilters } from "@/components/admin/members/member-filters";
import { ExportMenu } from "@/components/admin/members/export-menu";
import { MemberAvatar, MemberStatusBadge } from "@/components/admin/members/badges";
import { flatParams, pageParam, parseLenient, toQuery, type SearchParams } from "@/components/admin/members/query";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils/cn";

const PAGE_SIZE = 25;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("members");
  return { title: t("title") };
}

export default async function MembersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const auth = await requireAdmin("member:read", "/admin/members");
  const t = await getTranslations("members");
  const tc = await getTranslations("common");
  const locale = await getLocale();

  const params = flatParams(await searchParams);
  const filter: MemberListFilter = parseLenient(memberListSchema, params);
  const page = pageParam(params);
  const [{ items, total }, counts] = await Promise.all([
    listMembers(auth, filter, (page - 1) * PAGE_SIZE, PAGE_SIZE),
    memberStatusCounts(auth),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const role = auth.user.role;
  const lockMun = role === "MUNICIPAL_COORDINATOR" ? auth.user.municipalityId : null;
  const allCount = Object.values(counts).reduce((a, b) => a + b, 0);
  const filtersActive = Object.keys(params).some((k) => k !== "page" && k !== "sort");

  const listQuery = toQuery(params, ["page"]);
  const hrefWith = (patch: Record<string, string | undefined>) => {
    const q = toQuery({ ...params, ...patch }, ["page"]);
    return q ? `/admin/members?${q}` : "/admin/members";
  };

  const sortHeader = (field: "fullName" | "memberNumber" | "createdAt", label: string) => {
    const active = filter.sort.replace(/^-/, "") === field;
    const desc = filter.sort.startsWith("-");
    const next = active ? (desc ? field : `-${field}`) : field === "createdAt" ? "-createdAt" : field;
    const Icon = active ? (desc ? ArrowDown : ArrowUp) : ArrowUpDown;
    return (
      <TH aria-sort={active ? (desc ? "descending" : "ascending") : "none"}>
        <Link href={hrefWith({ sort: next })} className="inline-flex items-center gap-1 hover:text-foreground" scroll={false}>
          {label}
          <Icon className={cn("size-3.5", !active && "opacity-40")} aria-hidden />
        </Link>
      </TH>
    );
  };

  const tabs: { key: string; label: string; count: number }[] = [
    { key: "", label: tc("states.all"), count: allCount },
    ...MEMBER_STATUSES.map((s) => ({ key: s, label: tc(`enums.memberStatus.${s}`), count: counts[s] ?? 0 })),
  ];

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("listDescription")}
        actions={
          <>
            {can(role, "member:export") && <ExportMenu query={listQuery} total={total} />}
            {can(role, "member:import") && (
              <Link href="/admin/members/import" className={buttonVariants({ variant: "outline" })}>
                <Upload />
                {tc("actions.import")}
              </Link>
            )}
            {can(role, "member:create") && (
              <Link href="/admin/members/new" className={buttonVariants()}>
                <Plus />
                {t("new")}
              </Link>
            )}
          </>
        }
      />

      <nav aria-label={t("fields.status")} className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1">
        {tabs.map((tab) => {
          const active = (filter.status ?? "") === tab.key;
          return (
            <Link
              key={tab.key || "all"}
              href={hrefWith({ status: tab.key || undefined })}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
                tab.key === "PENDING" && !active && tab.count > 0 && "border-amber-400",
              )}
            >
              {tab.label}
              <span className={cn("rounded-full px-1.5 text-xs tabular-nums", active ? "bg-white/20" : "bg-muted text-muted-foreground")}>
                {formatNumber(tab.count, locale)}
              </span>
            </Link>
          );
        })}
      </nav>

      <MemberFilters lockMunicipalityId={lockMun} />

      <p className="mb-2 text-sm text-muted-foreground" aria-live="polite">
        {tc("pagination.total", { count: formatNumber(total, locale) })}
      </p>

      {items.length === 0 ? (
        <EmptyState
          icon={Users}
          title={filtersActive ? tc("states.noResults") : t("empty.title")}
          description={filtersActive ? t("empty.filtered") : t("empty.description")}
          action={
            filtersActive ? (
              <Link href="/admin/members" className={buttonVariants({ variant: "outline", size: "sm" })}>
                {tc("actions.clear")}
              </Link>
            ) : can(role, "member:create") ? (
              <Link href="/admin/members/new" className={buttonVariants({ size: "sm" })}>
                <Plus />
                {t("new")}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Cards on small screens */}
          <ul className="space-y-2 md:hidden">
            {items.map((m) => (
              <li key={m.id}>
                <Link href={`/admin/members/${m.id}`} className="flex items-center gap-3 rounded-lg border bg-card p-3 hover:bg-muted/50">
                  <MemberAvatar name={m.fullName} url={m.photoUrl} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate font-semibold">{m.fullName}</p>
                      <MemberStatusBadge status={m.status} />
                    </div>
                    <p className="truncate font-mono text-xs text-muted-foreground">{m.memberNumber ?? m.registrationRef}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.location.municipality.name} · {tc(`enums.gender.${m.gender}`)} · {t("ageYears", { age: m.age })}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {/* Table on md+ */}
          <div className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  {sortHeader("fullName", t("fields.fullName"))}
                  {sortHeader("memberNumber", t("fields.memberNumber"))}
                  <TH>{t("fields.location")}</TH>
                  <TH>{t("fields.genderAge")}</TH>
                  <TH>{t("fields.rank")}</TH>
                  <TH>{t("fields.status")}</TH>
                  {sortHeader("createdAt", t("fields.registered"))}
                </tr>
              </THead>
              <TBody>
                {items.map((m) => (
                  <TR key={m.id}>
                    <TD>
                      <Link href={`/admin/members/${m.id}`} className="flex items-center gap-3 font-semibold hover:text-primary">
                        <MemberAvatar name={m.fullName} url={m.photoUrl} size="sm" />
                        <span className="max-w-64 truncate">{m.fullName}</span>
                      </Link>
                    </TD>
                    <TD className="font-mono text-xs">{m.memberNumber ?? <span className="text-muted-foreground">{m.registrationRef}</span>}</TD>
                    <TD>
                      <span className="block">{m.location.municipality.name}</span>
                      {m.location.adminPost && <span className="block text-xs text-muted-foreground">{m.location.adminPost.name}</span>}
                    </TD>
                    <TD className="whitespace-nowrap">
                      {tc(`enums.gender.${m.gender}`)} · {m.age}
                    </TD>
                    <TD>{tc(`enums.memberRank.${m.rank}`)}</TD>
                    <TD>
                      <MemberStatusBadge status={m.status} />
                    </TD>
                    <TD className="whitespace-nowrap text-muted-foreground">{formatDate(m.createdAt, locale, { day: "2-digit", month: "short", year: "numeric" })}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>

          <Pagination
            className="mt-4"
            page={Math.min(page, pageCount)}
            pageCount={pageCount}
            hrefFor={(p) => pageHref(`/${locale}/admin/members`, params, p)}
            labels={{ previous: tc("actions.previous"), next: tc("actions.next"), page: (p, n) => tc("pagination.page", { page: p, total: n }) }}
          />
        </>
      )}
    </>
  );
}
