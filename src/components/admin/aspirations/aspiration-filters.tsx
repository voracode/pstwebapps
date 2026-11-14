"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect } from "@/components/ui/form-controls";
import { Switch } from "@/components/ui/overlays";
import { ASPIRATION_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from "@/lib/validation/content";
import { useUrlFilters } from "@/components/admin/members/use-url-filters";

const KEYS = ["q", "status", "category", "priority"] as const;
type Key = (typeof KEYS)[number];

export function AspirationFilters() {
  const t = useTranslations("aspirations");
  const tc = useTranslations("common");
  const { apply, get, pending } = useUrlFilters();
  const read = () => Object.fromEntries(KEYS.map((k) => [k, get(k)])) as Record<Key, string>;
  const [f, setF] = useState(read);
  const sig = KEYS.map(get).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setF(read()), [sig]);
  const set = (k: Key) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const mine = get("assignedToMe") === "true";
  const active = KEYS.some((k) => !!get(k)) || mine;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    apply({ ...f, q: f.q.trim() });
  };

  return (
    <form onSubmit={submit} className="mb-4 space-y-3 rounded-lg border bg-card p-3 sm:p-4" role="search" aria-label={t("filters.title")}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input type="search" value={f.q} onChange={set("q")} placeholder={t("filters.searchPlaceholder")} aria-label={tc("actions.search")} className="pl-9" maxLength={100} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="af-status">{t("fields.status")}</Label>
          <NativeSelect id="af-status" value={f.status} onChange={set("status")}>
            <option value="">{tc("geo.any")}</option>
            {TICKET_STATUSES.map((v) => (
              <option key={v} value={v}>
                {tc(`enums.ticketStatus.${v}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="af-category">{t("fields.category")}</Label>
          <NativeSelect id="af-category" value={f.category} onChange={set("category")}>
            <option value="">{tc("geo.any")}</option>
            {ASPIRATION_CATEGORIES.map((v) => (
              <option key={v} value={v}>
                {tc(`enums.aspirationCategory.${v}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="af-priority">{t("fields.priority")}</Label>
          <NativeSelect id="af-priority" value={f.priority} onChange={set("priority")}>
            <option value="">{tc("geo.any")}</option>
            {TICKET_PRIORITIES.map((v) => (
              <option key={v} value={v}>
                {tc(`enums.ticketPriority.${v}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium" htmlFor="af-mine">
          <Switch id="af-mine" checked={mine} onCheckedChange={(v) => apply({ assignedToMe: v ? "true" : undefined })} />
          {t("filters.assignedToMe")}
        </label>
        <div className="flex gap-2">
          {active && (
            <Button type="button" variant="ghost" size="sm" onClick={() => apply({}, { replaceAll: true })}>
              <X />
              {tc("actions.clear")}
            </Button>
          )}
          <Button type="submit" size="sm" loading={pending}>
            <Search />
            {tc("actions.filter")}
          </Button>
        </div>
      </div>
    </form>
  );
}
