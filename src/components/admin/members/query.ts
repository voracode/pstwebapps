import type { ZodType } from "zod";

export type SearchParams = Record<string, string | string[] | undefined>;

/** `?a=1&a=2` → `{ a: "1" }`; drops empty values. */
export function flatParams(sp: SearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val !== undefined && val !== "") out[k] = val;
  }
  return out;
}

/**
 * Parses URL filters with a zod schema, silently dropping invalid keys
 * (a hand-edited URL should show results, not an error page).
 */
export function parseLenient<T>(schema: ZodType<T>, input: Record<string, string>): T {
  let data: Record<string, string> = { ...input };
  for (let i = 0; i < 5; i++) {
    const r = schema.safeParse(data);
    if (r.success) return r.data;
    const bad = new Set(r.error.issues.map((iss) => String(iss.path[0] ?? "")));
    if (!bad.size || [...bad].every((k) => !(k in data))) break;
    data = Object.fromEntries(Object.entries(data).filter(([k]) => !bad.has(k)));
  }
  return schema.parse({});
}

/** Page number from `?page=` (1-based, clamped). */
export function pageParam(sp: Record<string, string>): number {
  const n = Number(sp.page);
  return Number.isInteger(n) && n > 0 && n < 100_000 ? n : 1;
}

/** Builds a query string from a flat record, skipping empty values. */
export function toQuery(params: Record<string, string | number | boolean | undefined | null>, omit: string[] = []): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (omit.includes(k) || v === undefined || v === null || v === "" || v === false) continue;
    sp.set(k, String(v));
  }
  return sp.toString();
}

/** "2026-11-13" for <input type="date"> values from a Date (UTC date part). */
export const isoDay = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
