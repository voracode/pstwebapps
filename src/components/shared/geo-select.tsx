"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { NativeSelect, Label } from "@/components/ui/form-controls";
import { cn } from "@/lib/utils/cn";

export interface GeoValue {
  municipalityId?: number;
  adminPostId?: number;
  sucoId?: number;
  aldeiaId?: number;
}

interface Option {
  id: number;
  name: string;
}

type Level = "municipality" | "adminPost" | "suco" | "aldeia";
const ORDER: Level[] = ["municipality", "adminPost", "suco", "aldeia"];
const KEY: Record<Level, keyof GeoValue> = { municipality: "municipalityId", adminPost: "adminPostId", suco: "sucoId", aldeia: "aldeiaId" };

const cache = new Map<string, Promise<Option[]>>();
function load(level: Level, parentId?: number): Promise<Option[]> {
  const k = `${level}:${parentId ?? ""}`;
  if (!cache.has(k)) {
    const q = parentId ? `level=${level}&parentId=${parentId}` : `level=${level}`;
    cache.set(
      k,
      fetch(`/api/geo?${q}`)
        .then((r) => r.json())
        .then((j: { data?: Option[] }) => j.data ?? [])
        .catch(() => {
          cache.delete(k);
          return [];
        }),
    );
  }
  return cache.get(k)!;
}

/**
 * Cascading Município → Posto → Suco → Aldeia selects (data from /api/geo,
 * cached per session). Lower levels appear only when they have options, so
 * municipalities without seeded sucos still work.
 *
 * - `levels`: deepest level to show (default "aldeia").
 * - `allowAny`: first option means "any" (filters) instead of "select".
 * - `lockMunicipalityId`: fixes the município (municipal coordinators).
 * - `names`: when set, renders hidden inputs with these names (plain <form> posts).
 */
export function GeoSelect({
  value,
  onChange,
  levels = "aldeia",
  allowAny,
  required,
  lockMunicipalityId,
  names,
  errors,
  className,
  layout = "grid",
}: {
  value: GeoValue;
  onChange: (v: GeoValue) => void;
  levels?: Level;
  allowAny?: boolean;
  required?: boolean;
  lockMunicipalityId?: number | null;
  names?: Partial<Record<keyof GeoValue, string>>;
  errors?: Partial<Record<keyof GeoValue, string>>;
  className?: string;
  layout?: "grid" | "stack";
}) {
  const t = useTranslations("common.geo");
  const depth = ORDER.indexOf(levels) + 1;
  const [opts, setOpts] = useState<Record<Level, Option[]>>({ municipality: [], adminPost: [], suco: [], aldeia: [] });

  const v: GeoValue = lockMunicipalityId ? { ...value, municipalityId: lockMunicipalityId } : value;

  useEffect(() => {
    load("municipality").then((o) => setOpts((s) => ({ ...s, municipality: o })));
  }, []);
  useEffect(() => {
    if (depth < 2 || !v.municipalityId) return setOpts((s) => ({ ...s, adminPost: [] }));
    load("adminPost", v.municipalityId).then((o) => setOpts((s) => ({ ...s, adminPost: o })));
  }, [v.municipalityId, depth]);
  useEffect(() => {
    if (depth < 3 || !v.adminPostId) return setOpts((s) => ({ ...s, suco: [] }));
    load("suco", v.adminPostId).then((o) => setOpts((s) => ({ ...s, suco: o })));
  }, [v.adminPostId, depth]);
  useEffect(() => {
    if (depth < 4 || !v.sucoId) return setOpts((s) => ({ ...s, aldeia: [] }));
    load("aldeia", v.sucoId).then((o) => setOpts((s) => ({ ...s, aldeia: o })));
  }, [v.sucoId, depth]);

  const set = (level: Level, raw: string) => {
    const id = raw ? Number(raw) : undefined;
    const i = ORDER.indexOf(level);
    const next: GeoValue = { ...v, [KEY[level]]: id };
    // Changing a level clears everything below it.
    for (const lower of ORDER.slice(i + 1)) next[KEY[lower]] = undefined;
    onChange(next);
  };

  return (
    <div className={cn(layout === "grid" ? "grid gap-3 sm:grid-cols-2" : "space-y-3", className)}>
      {ORDER.slice(0, depth).map((level, i) => {
        const options = opts[level];
        const parentChosen = i === 0 || !!v[KEY[ORDER[i - 1]!]];
        if (i > 0 && (!parentChosen || options.length === 0)) return null;
        const id = `geo-${level}`;
        const err = errors?.[KEY[level]];
        return (
          <div key={level} className="space-y-1.5">
            <Label htmlFor={id}>
              {t(level)}
              {required && i < 2 && <span className="ml-0.5 text-pst-red" aria-hidden>*</span>}
            </Label>
            <NativeSelect
              id={id}
              value={v[KEY[level]] ?? ""}
              onChange={(e) => set(level, e.target.value)}
              disabled={level === "municipality" && !!lockMunicipalityId}
              required={required && i < 2}
              aria-invalid={!!err || undefined}
            >
              <option value="">{allowAny ? t("any") : t("select")}</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </NativeSelect>
            {err && <p className="text-xs font-medium text-destructive">{err}</p>}
            {names?.[KEY[level]] && <input type="hidden" name={names[KEY[level]]} value={v[KEY[level]] ?? ""} />}
          </div>
        );
      })}
    </div>
  );
}
