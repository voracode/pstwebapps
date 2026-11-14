"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect } from "@/components/ui/form-controls";
import { EVENT_STATUSES, EVENT_TYPES } from "@/lib/validation/content";
import { useUrlFilters } from "@/components/admin/members/use-url-filters";

const KEYS = ["type", "status", "municipalityId", "from", "to"] as const;
type Key = (typeof KEYS)[number];

export function EventFilters({ municipalities }: { municipalities: { id: number; name: string }[] | null }) {
  const t = useTranslations("events");
  const tc = useTranslations("common");
  const { apply, get, pending } = useUrlFilters();
  const read = () => Object.fromEntries(KEYS.map((k) => [k, get(k)])) as Record<Key, string>;
  const [f, setF] = useState(read);
  const sig = KEYS.map(get).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setF(read()), [sig]);
  const set = (k: Key) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const active = KEYS.some((k) => !!get(k));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    apply(f);
  };

  return (
    <form onSubmit={submit} className="mb-4 rounded-lg border bg-card p-3 sm:p-4" role="search" aria-label={t("filters.title")}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1.5">
          <Label htmlFor="ef-type">{t("fields.type")}</Label>
          <NativeSelect id="ef-type" value={f.type} onChange={set("type")}>
            <option value="">{tc("geo.any")}</option>
            {EVENT_TYPES.map((v) => (
              <option key={v} value={v}>
                {tc(`enums.eventType.${v}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ef-status">{t("fields.status")}</Label>
          <NativeSelect id="ef-status" value={f.status} onChange={set("status")}>
            <option value="">{tc("geo.any")}</option>
            {EVENT_STATUSES.map((v) => (
              <option key={v} value={v}>
                {tc(`enums.eventStatus.${v}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        {municipalities && (
          <div className="space-y-1.5">
            <Label htmlFor="ef-mun">{tc("geo.municipality")}</Label>
            <NativeSelect id="ef-mun" value={f.municipalityId} onChange={set("municipalityId")}>
              <option value="">{tc("geo.any")}</option>
              {municipalities.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="ef-from">{t("filters.from")}</Label>
          <Input id="ef-from" type="date" value={f.from} onChange={set("from")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ef-to">{t("filters.to")}</Label>
          <Input id="ef-to" type="date" value={f.to} min={f.from || undefined} onChange={set("to")} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
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
    </form>
  );
}
