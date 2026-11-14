"use client";

import { Fragment, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, ScrollText } from "lucide-react";
import { Badge, EmptyState, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils/cn";

export interface AuditRow {
  id: string;
  createdAt: string;
  action: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  actorEmail: string | null;
  actorRole: string | null;
  entityType: string | null;
  entityId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  metadata: unknown;
  hash: string;
}

const SEVERITY_VARIANT = { INFO: "muted", WARNING: "warning", CRITICAL: "danger" } as const;

export function AuditTable({ rows }: { rows: AuditRow[] }) {
  const t = useTranslations("audit");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [open, setOpen] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!rows.length) return <EmptyState icon={ScrollText} title={tc("states.noResults")} />;

  return (
    <Table className="text-xs">
      <THead>
        <tr>
          <TH className="w-8">
            <span className="sr-only">{t("details")}</span>
          </TH>
          <TH>{t("time")}</TH>
          <TH>{t("action")}</TH>
          <TH>{t("severity")}</TH>
          <TH>{t("actor")}</TH>
          <TH className="hidden md:table-cell">{t("entity")}</TH>
          <TH className="hidden lg:table-cell">{t("ip")}</TH>
        </tr>
      </THead>
      <TBody>
        {rows.map((r) => {
          const isOpen = open.has(r.id);
          return (
            <Fragment key={r.id}>
              <TR className={cn("cursor-pointer", isOpen && "bg-muted/40")} onClick={() => toggle(r.id)}>
                <TD className="py-1.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(r.id);
                    }}
                    aria-expanded={isOpen}
                    aria-controls={`audit-${r.id}`}
                    aria-label={t("toggleDetails", { id: r.id })}
                    className="rounded p-0.5 hover:bg-muted"
                  >
                    {isOpen ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
                  </button>
                </TD>
                <TD className="whitespace-nowrap py-1.5 tabular-nums">
                  {formatDate(r.createdAt, locale, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </TD>
                <TD className="py-1.5 font-mono">{r.action}</TD>
                <TD className="py-1.5">
                  <Badge variant={SEVERITY_VARIANT[r.severity]}>{t(`severities.${r.severity}`)}</Badge>
                </TD>
                <TD className="max-w-48 py-1.5">
                  <div className="truncate">{r.actorEmail ?? <span className="text-muted-foreground">{t("system")}</span>}</div>
                  {r.actorRole && <div className="text-[11px] text-muted-foreground">{tc(`enums.role.${r.actorRole}`)}</div>}
                </TD>
                <TD className="hidden max-w-56 py-1.5 md:table-cell">
                  {r.entityType ? (
                    <span className="truncate">
                      {r.entityType}
                      {r.entityId && <span className="ml-1 font-mono text-muted-foreground">{r.entityId}</span>}
                    </span>
                  ) : (
                    "—"
                  )}
                </TD>
                <TD className="hidden py-1.5 font-mono lg:table-cell">{r.ipAddress ?? "—"}</TD>
              </TR>
              {isOpen && (
                <tr id={`audit-${r.id}`} className="bg-muted/20">
                  <td colSpan={7} className="px-3 pb-3 pt-1">
                    <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[auto_1fr]">
                      <dt className="text-muted-foreground">#</dt>
                      <dd className="font-mono">{r.id}</dd>
                      {r.entityType && (
                        <>
                          <dt className="text-muted-foreground md:hidden">{t("entity")}</dt>
                          <dd className="break-all font-mono md:hidden">
                            {r.entityType} {r.entityId}
                          </dd>
                        </>
                      )}
                      <dt className="text-muted-foreground lg:hidden">{t("ip")}</dt>
                      <dd className="font-mono lg:hidden">{r.ipAddress ?? "—"}</dd>
                      <dt className="text-muted-foreground">{t("userAgent")}</dt>
                      <dd className="break-all">{r.userAgent ?? "—"}</dd>
                      <dt className="text-muted-foreground">{t("requestId")}</dt>
                      <dd className="break-all font-mono">{r.requestId ?? "—"}</dd>
                      <dt className="text-muted-foreground">{t("hash")}</dt>
                      <dd className="break-all font-mono">{r.hash}</dd>
                    </dl>
                    <p className="mb-1 mt-2 font-semibold">{t("metadata")}</p>
                    {r.metadata == null ? (
                      <p className="text-muted-foreground">—</p>
                    ) : (
                      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-background p-2 font-mono text-[11px]">
                        {JSON.stringify(r.metadata, null, 2)}
                      </pre>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </TBody>
    </Table>
  );
}
