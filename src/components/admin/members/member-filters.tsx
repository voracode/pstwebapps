"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect } from "@/components/ui/form-controls";
import { GeoSelect, type GeoValue } from "@/components/shared/geo-select";
import { MEMBER_RANKS, MEMBER_STATUSES, GENDERS } from "@/lib/validation/member";
import { useUrlFilters } from "./use-url-filters";

const CHANNELS = ["ONLINE", "FIELD_IMPORT", "BACKOFFICE", "LEGACY_MIGRATION"] as const;
const ADVANCED = ["rank", "gender", "channel", "municipalityId", "adminPostId", "sucoId", "aldeiaId", "ageMin", "ageMax", "createdFrom", "createdTo"];

const num = (v: string) => (v ? Number(v) : undefined);

export function MemberFilters({ lockMunicipalityId }: { lockMunicipalityId?: number | null }) {
  const t = useTranslations("members");
  const tc = useTranslations("common");
  const { apply, get, pending } = useUrlFilters();

  const read = () => ({
    q: get("q"),
    status: get("status"),
    rank: get("rank"),
    gender: get("gender"),
    channel: get("channel"),
    ageMin: get("ageMin"),
    ageMax: get("ageMax"),
    createdFrom: get("createdFrom"),
    createdTo: get("createdTo"),
    geo: {
      municipalityId: num(get("municipalityId")),
      adminPostId: num(get("adminPostId")),
      sucoId: num(get("sucoId")),
      aldeiaId: num(get("aldeiaId")),
    } as GeoValue,
  });

  const [f, setF] = useState(read);
  const advancedActive = ADVANCED.some((k) => !!get(k) && !(k === "municipalityId" && lockMunicipalityId));
  const [open, setOpen] = useState(advancedActive);
  // Keep the form in sync when the URL changes (back button, tab links).
  const key = ["q", "status", ...ADVANCED].map(get).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setF(read()), [key]);

  const set = <K extends keyof ReturnType<typeof read>>(k: K, v: ReturnType<typeof read>[K]) => setF((s) => ({ ...s, [k]: v }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    apply({
      q: f.q.trim(),
      status: f.status,
      rank: f.rank,
      gender: f.gender,
      channel: f.channel,
      ageMin: f.ageMin,
      ageMax: f.ageMax,
      createdFrom: f.createdFrom,
      createdTo: f.createdTo,
      municipalityId: lockMunicipalityId ? undefined : f.geo.municipalityId,
      adminPostId: f.geo.adminPostId,
      sucoId: f.geo.sucoId,
      aldeiaId: f.geo.aldeiaId,
    });
  };

  const clear = () => apply({ sort: get("sort") }, { replaceAll: true });
  const anyActive = !!get("q") || !!get("status") || advancedActive;

  return (
    <form onSubmit={submit} className="mb-4 space-y-3 rounded-lg border bg-card p-3 sm:p-4" role="search" aria-label={t("filters.title")}>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={f.q}
            onChange={(e) => set("q", e.target.value)}
            placeholder={t("filters.searchPlaceholder")}
            aria-label={tc("actions.search")}
            className="pl-9"
            maxLength={100}
          />
        </div>
        <div className="flex gap-2">
          <NativeSelect value={f.status} onChange={(e) => set("status", e.target.value)} aria-label={t("fields.status")} className="min-w-36">
            <option value="">{t("filters.anyStatus")}</option>
            {MEMBER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {tc(`enums.memberStatus.${s}`)}
              </option>
            ))}
          </NativeSelect>
          <Button type="button" variant="outline" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="member-advanced-filters">
            <SlidersHorizontal />
            <span className="hidden sm:inline">{t("filters.more")}</span>
          </Button>
        </div>
      </div>

      {open && (
        <div id="member-advanced-filters" className="space-y-3 border-t pt-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="f-rank">{t("fields.rank")}</Label>
              <NativeSelect id="f-rank" value={f.rank} onChange={(e) => set("rank", e.target.value)}>
                <option value="">{tc("geo.any")}</option>
                {MEMBER_RANKS.map((r) => (
                  <option key={r} value={r}>
                    {tc(`enums.memberRank.${r}`)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-gender">{t("fields.gender")}</Label>
              <NativeSelect id="f-gender" value={f.gender} onChange={(e) => set("gender", e.target.value)}>
                <option value="">{tc("geo.any")}</option>
                {GENDERS.map((g) => (
                  <option key={g} value={g}>
                    {tc(`enums.gender.${g}`)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-channel">{t("fields.channel")}</Label>
              <NativeSelect id="f-channel" value={f.channel} onChange={(e) => set("channel", e.target.value)}>
                <option value="">{tc("geo.any")}</option>
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {tc(`enums.registrationChannel.${c}`)}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <GeoSelect value={f.geo} onChange={(g) => set("geo", g)} allowAny lockMunicipalityId={lockMunicipalityId} className="lg:grid-cols-4" />

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="f-ageMin">{t("filters.ageMin")}</Label>
              <Input id="f-ageMin" type="number" inputMode="numeric" min={0} max={120} value={f.ageMin} onChange={(e) => set("ageMin", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-ageMax">{t("filters.ageMax")}</Label>
              <Input id="f-ageMax" type="number" inputMode="numeric" min={0} max={120} value={f.ageMax} onChange={(e) => set("ageMax", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-createdFrom">{t("filters.createdFrom")}</Label>
              <Input id="f-createdFrom" type="date" value={f.createdFrom} onChange={(e) => set("createdFrom", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-createdTo">{t("filters.createdTo")}</Label>
              <Input id="f-createdTo" type="date" value={f.createdTo} min={f.createdFrom || undefined} onChange={(e) => set("createdTo", e.target.value)} />
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {anyActive && (
          <Button type="button" variant="ghost" size="sm" onClick={clear}>
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
