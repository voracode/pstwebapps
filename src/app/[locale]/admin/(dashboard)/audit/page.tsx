import type { Metadata } from "next";
import { isIP } from "node:net";
import { getLocale, getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth/server";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { PageHeader } from "@/components/admin/page-header";
import { Input, Label, NativeSelect } from "@/components/ui/form-controls";
import { Alert, Card, CardContent } from "@/components/ui/primitives";
import { Pagination, pageHref } from "@/components/ui/pagination";
import { FilterForm, oneOf, pageNumber, sp } from "@/components/admin/cms/filter-form";
import { AuditTable, type AuditRow } from "@/components/admin/audit/audit-table";
import { VerifyChain } from "@/components/admin/audit/verify-chain";

const PAGE_SIZE = 50;
const SEVERITIES = ["INFO", "WARNING", "CRITICAL"] as const;
const ACTION_PREFIXES = ["auth.", "user.", "member.", "kta.", "post.", "media.", "document.", "leadership.", "branch.", "event.", "aspiration.", "site.", "album.", "settings.", "audit."];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" (Dili calendar day) → start/end instant. */
function dayBound(v: string | undefined, end: boolean): Date | undefined {
  if (!v || !DAY.test(v)) return undefined;
  const d = new Date(`${v}T${end ? "23:59:59.999" : "00:00:00.000"}+09:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("audit");
  return { title: t("title") };
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin("audit:read");
  const params = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations("audit");
  const tc = await getTranslations("common");

  const f = {
    action: sp(params, "action")?.trim().slice(0, 80),
    actorEmail: sp(params, "actorEmail")?.trim().slice(0, 160),
    entityType: sp(params, "entityType")?.trim().slice(0, 60),
    entityId: sp(params, "entityId")?.trim().slice(0, 64),
    severity: oneOf(sp(params, "severity"), SEVERITIES),
    ip: sp(params, "ip")?.trim().slice(0, 64),
    from: sp(params, "from"),
    to: sp(params, "to"),
  };
  const ipValid = !f.ip || isIP(f.ip) !== 0;
  const from = dayBound(f.from, false);
  const to = dayBound(f.to, true);
  const page = pageNumber(sp(params, "page"));

  const where: Prisma.AuditLogWhereInput = {
    ...(f.action ? { action: { startsWith: f.action } } : {}),
    ...(f.actorEmail ? { actorEmail: { contains: f.actorEmail, mode: "insensitive" } } : {}),
    ...(f.entityType ? { entityType: f.entityType } : {}),
    ...(f.entityId ? { entityId: f.entityId } : {}),
    ...(f.severity ? { severity: f.severity } : {}),
    ...(f.ip && ipValid ? { ipAddress: f.ip } : {}),
    ...(from || to ? { createdAt: { gte: from, lte: to } } : {}),
  };

  const [rows, total] = ipValid
    ? await Promise.all([
        db.auditLog.findMany({ where, orderBy: { id: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
        db.auditLog.count({ where }),
      ])
    : [[], 0];

  const items: AuditRow[] = rows.map((r) => ({
    id: r.id.toString(),
    createdAt: r.createdAt.toISOString(),
    action: r.action,
    severity: r.severity,
    actorEmail: r.actorEmail,
    actorRole: r.actorRole,
    entityType: r.entityType,
    entityId: r.entityId,
    ipAddress: r.ipAddress,
    userAgent: r.userAgent,
    requestId: r.requestId,
    metadata: r.metadata,
    hash: r.hash,
  }));
  const base = `/${locale}/admin/audit`;
  const hasFilters = Object.values(f).some(Boolean);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Card className="mb-4">
        <CardContent className="pt-5">
          <p className="mb-3 text-sm text-muted-foreground">{t("verify.description")}</p>
          <VerifyChain />
        </CardContent>
      </Card>

      <FilterForm action={base} submitLabel={tc("actions.filter")} clearLabel={tc("actions.clear")} showClear={hasFilters}>
        <div className="space-y-1.5">
          <Label htmlFor="f-action">{t("filters.action")}</Label>
          <Input id="f-action" name="action" defaultValue={f.action ?? ""} list="audit-actions" placeholder="auth." autoComplete="off" />
          <datalist id="audit-actions">
            {ACTION_PREFIXES.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-actor">{t("filters.actorEmail")}</Label>
          <Input id="f-actor" name="actorEmail" type="search" defaultValue={f.actorEmail ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-severity">{t("severity")}</Label>
          <NativeSelect id="f-severity" name="severity" defaultValue={f.severity ?? ""}>
            <option value="">{tc("states.all")}</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {t(`severities.${s}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-etype">{t("filters.entityType")}</Label>
          <Input id="f-etype" name="entityType" defaultValue={f.entityType ?? ""} placeholder="Member" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-eid">{t("filters.entityId")}</Label>
          <Input id="f-eid" name="entityId" defaultValue={f.entityId ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-ip">{t("ip")}</Label>
          <Input id="f-ip" name="ip" defaultValue={f.ip ?? ""} aria-invalid={!ipValid || undefined} aria-describedby={!ipValid ? "f-ip-error" : undefined} />
          {!ipValid && (
            <p id="f-ip-error" className="text-xs font-medium text-destructive">
              {t("filters.ipInvalid")}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-from">{t("filters.from")}</Label>
          <Input id="f-from" name="from" type="date" defaultValue={f.from ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-to">{t("filters.to")}</Label>
          <Input id="f-to" name="to" type="date" defaultValue={f.to ?? ""} />
        </div>
      </FilterForm>

      {!ipValid && <Alert variant="error" className="mb-4">{t("filters.ipInvalid")}</Alert>}
      <p className="mb-2 text-sm text-muted-foreground">
        {tc("pagination.total", { count: total })} · {t("timezone")}
      </p>
      <AuditTable rows={items} />
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
