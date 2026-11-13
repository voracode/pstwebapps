import type { Locale as DbLocale } from "@/generated/prisma/client";
import { localeToEnum, type AppLocale } from "@/lib/validation/common";

/** Fallback order when a translation is missing: requested → Tetum → Portuguese → English → Indonesian. */
const FALLBACK: DbLocale[] = ["TET", "PT", "EN", "ID"];

export function pickTranslation<T extends { locale: DbLocale }>(rows: T[], locale: AppLocale | DbLocale): (T & { isFallback: boolean }) | null {
  const wanted = (locale.length <= 3 && locale === locale.toLowerCase() ? localeToEnum(locale as AppLocale) : locale) as DbLocale;
  const exact = rows.find((r) => r.locale === wanted);
  if (exact) return { ...exact, isFallback: false };
  for (const l of FALLBACK) {
    const hit = rows.find((r) => r.locale === l);
    if (hit) return { ...hit, isFallback: true };
  }
  return null;
}
