/**
 * Formatting helpers. Timor-Leste is UTC+9 (Asia/Dili, no DST). Intl has no
 * Tetum locale data, so Tetum uses Portuguese (Timor-Leste) conventions,
 * which is what Timorese readers expect for dates and numbers.
 */
const INTL_LOCALE: Record<string, string> = { tet: "pt-TL", pt: "pt-PT", id: "id-ID", en: "en-GB" };
const TZ = "Asia/Dili";

export const intlLocale = (locale: string) => INTL_LOCALE[locale] ?? "pt-PT";

type DateInput = Date | string | number | null | undefined;
const toDate = (d: DateInput) => (d === null || d === undefined ? null : d instanceof Date ? d : new Date(d));

export function formatDate(d: DateInput, locale: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" }) {
  const date = toDate(d);
  if (!date || Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: TZ, ...opts }).format(date);
}

export function formatDateShort(d: DateInput, locale: string) {
  return formatDate(d, locale, { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatDateTime(d: DateInput, locale: string) {
  return formatDate(d, locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatTime(d: DateInput, locale: string) {
  return formatDate(d, locale, { hour: "2-digit", minute: "2-digit" });
}

/** For a @db.Date value ("YYYY-MM-DD" or UTC-midnight Date): format without timezone shift. */
export function formatDay(d: DateInput, locale: string) {
  const date = toDate(d);
  if (!date || Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }).format(date);
}

export function formatNumber(n: number | null | undefined, locale: string) {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat(intlLocale(locale)).format(n);
}

export function formatBytes(bytes: number | null | undefined) {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

/** "3 days ago" style relative time. */
export function formatRelative(d: DateInput, locale: string) {
  const date = toDate(d);
  if (!date) return "—";
  const diffSec = Math.round((date.getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, "second");
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(diffSec / 3600), "hour");
  if (abs < 30 * 86_400) return rtf.format(Math.round(diffSec / 86_400), "day");
  return formatDate(date, locale);
}
