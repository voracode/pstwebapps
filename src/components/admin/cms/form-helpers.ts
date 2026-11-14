import { ApiClientError } from "@/lib/api-client";
import type { EditLocale } from "@/components/admin/translation-tabs";

// Same order as EDIT_LOCALES (re-declared: that module is a client module).
const EDIT_LOCALES: readonly EditLocale[] = ["TET", "PT", "ID", "EN"];

/**
 * Small helpers shared by the backoffice editors (posts, documents,
 * leadership, website content…). Client-safe: no server imports.
 */

export type ByLocale<T> = Record<EditLocale, T>;

export const LOWER: Record<EditLocale, "tet" | "pt" | "id" | "en"> = { TET: "tet", PT: "pt", ID: "id", EN: "en" };

export function byLocale<T>(make: (l: EditLocale) => T): ByLocale<T> {
  return { TET: make("TET"), PT: make("PT"), ID: make("ID"), EN: make("EN") };
}

/** Fills the per-locale editor state from API translation rows. */
export function fromRows<R extends { locale: string }, T>(rows: R[] | undefined, empty: () => T, map: (row: R) => T): ByLocale<T> {
  return byLocale((l) => {
    const row = rows?.find((r) => r.locale === l);
    return row ? map(row) : empty();
  });
}

/**
 * Builds `translations` + `removeLocales` following the TranslationTabs
 * convention: send filled locales; locales that existed but are now empty
 * are removed.
 */
export function translationPayload<T, P>(
  state: ByLocale<T>,
  isFilled: (v: T) => boolean,
  toPayload: (l: EditLocale, v: T) => P,
  existing: readonly string[] = [],
) {
  const sent = EDIT_LOCALES.filter((l) => isFilled(state[l]));
  return {
    sent,
    translations: sent.map((l) => toPayload(l, state[l])),
    removeLocales: existing.filter((l): l is EditLocale => (EDIT_LOCALES as readonly string[]).includes(l) && !sent.includes(l as EditLocale)),
  };
}

/**
 * Field errors from a 422 response, with "translations.<i>.<field>" rewritten
 * to "<LOCALE>.<field>" using the order the translations were sent in.
 */
export function mapFieldErrors(err: unknown, sent: readonly EditLocale[] = []): Record<string, string> {
  if (!(err instanceof ApiClientError)) return {};
  const out: Record<string, string> = {};
  for (const [path, msg] of Object.entries(err.fieldErrors)) {
    const m = /^translations\.(\d+)\.(.+)$/.exec(path);
    if (m) {
      const l = sent[Number(m[1])];
      if (l) out[`${l}.${m[2]}`] = msg;
    } else out[path] = msg;
  }
  return out;
}

// ---------------------------------------------------------------- Dates (Asia/Dili, UTC+9, no DST)
const DILI_OFFSET_MS = 9 * 3600 * 1000;

/** Date → "YYYY-MM-DDTHH:mm" in Dili time, for <input type="datetime-local">. */
export function toDiliInput(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() + DILI_OFFSET_MS).toISOString().slice(0, 16);
}

/** "YYYY-MM-DDTHH:mm" entered in Dili time → ISO string (or null when empty). */
export function fromDiliInput(v: string): string | null {
  if (!v) return null;
  return `${v}:00+09:00`;
}

/** @db.Date / UTC-midnight value → "YYYY-MM-DD". */
export function toDateInput(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

export const isHttpsUrl = (v: string) => {
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
};

/** Picks a translation row for the UI locale (fallback tet → pt → en → id). */
export function pickRow<R extends { locale: string }>(rows: R[] | undefined, uiLocale: string): R | undefined {
  if (!rows?.length) return undefined;
  const want = uiLocale.toUpperCase();
  return rows.find((r) => r.locale === want) ?? ["TET", "PT", "EN", "ID"].map((l) => rows.find((r) => r.locale === l)).find(Boolean);
}
