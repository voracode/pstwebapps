import { z } from "zod";

export const LOCALES = ["tet", "pt", "id", "en"] as const;
export type AppLocale = (typeof LOCALES)[number];

/** URL locale code ("tet") ↔ Prisma enum ("TET"). */
export const localeToEnum = (l: AppLocale) => l.toUpperCase() as "TET" | "PT" | "ID" | "EN";
export const enumToLocale = (l: "TET" | "PT" | "ID" | "EN") => l.toLowerCase() as AppLocale;

export const localeSchema = z.enum(LOCALES);
export const localeEnumSchema = z.enum(["TET", "PT", "ID", "EN"]);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(160)
  .pipe(z.email({ message: "Invalid e-mail address" }));

/** Trims and turns "" into undefined (HTML forms send empty strings). */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const requiredText = (min: number, max: number) => z.string().trim().min(min).max(max);

export const optionalInt = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => (v === undefined || v === "" ? undefined : Number(v)))
  .pipe(z.number().int().positive().optional());

export const requiredInt = z.coerce.number().int().positive();

/**
 * Timor-Leste phone numbers → E.164.
 * Mobile: 8 digits starting with 7 (e.g. 7712 3456); landline: 7 digits.
 * Accepts "+670 7712 3456", "0067077123456", "77123456". Foreign numbers
 * with an explicit +country code are accepted as-is (diaspora members).
 */
export function normalizePhone(raw: string): string | null {
  let s = raw.replace(/[\s\-().]/g, "");
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  if (/^670\d{7,8}$/.test(s)) s = `+${s}`;
  if (/^\d{7,8}$/.test(s)) s = `+670${s}`;
  if (!/^\+\d{8,15}$/.test(s)) return null;
  if (s.startsWith("+670") && !/^\+670(7\d{7}|[2-4]\d{6})$/.test(s)) return null;
  return s;
}

export const phoneSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = normalizePhone(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "Invalid phone number" });
      return z.NEVER;
    }
    return n;
  });

export const optionalPhone = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return undefined;
    const n = normalizePhone(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "Invalid phone number" });
      return z.NEVER;
    }
    return n;
  });

/** "YYYY-MM-DD" → Date at UTC midnight (for @db.Date columns). */
export const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .transform((v, ctx) => {
    const d = new Date(`${v}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) {
      ctx.addIssue({ code: "custom", message: "Invalid date" });
      return z.NEVER;
    }
    return d;
  });

export const booleanish = z
  .union([z.boolean(), z.enum(["true", "false", "on", "1", "0", ""])])
  .optional()
  .transform((v) => v === true || v === "true" || v === "on" || v === "1");

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug may only contain a-z, 0-9 and single dashes");
