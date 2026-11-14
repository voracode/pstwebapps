import { LOCALES, type AppLocale } from "@/lib/validation/common";

/** Narrows the `[locale]` route param (already validated by the root layout). */
export function asLocale(raw: string): AppLocale {
  return (LOCALES as readonly string[]).includes(raw) ? (raw as AppLocale) : "tet";
}

/** First value of a search param. */
export function sp(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() ? s.trim() : undefined;
}

/** Positive page number from `?page=`. */
export function pageParam(v: string | string[] | undefined): number {
  const n = Number(sp(v));
  return Number.isInteger(n) && n > 0 && n < 10_000 ? n : 1;
}

/** Validates an enum-like query value against an allowed list. */
export function enumParam<T extends string>(v: string | string[] | undefined, allowed: readonly T[]): T | undefined {
  const s = sp(v);
  return s && (allowed as readonly string[]).includes(s) ? (s as T) : undefined;
}

/** hreflang map for a path that is identical in every locale. */
export function alternatesFor(locale: string, path: string) {
  const suffix = path === "/" ? "" : path;
  return {
    canonical: `/${locale}${suffix}`,
    languages: Object.fromEntries([...LOCALES.map((l) => [l === "tet" ? "tet-TL" : l, `/${l}${suffix}`]), ["x-default", `/tet${suffix}`]]),
  };
}
