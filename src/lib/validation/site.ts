import { z } from "zod";
import { localeEnumSchema, optionalText, slugSchema } from "./common";

/**
 * Website content managed from the backoffice: page sections (About,
 * History, Ideology, Program), hero slides, photo albums and site settings.
 */

export const PAGE_KEYS = ["ABOUT", "HISTORY", "IDEOLOGY", "PROGRAM"] as const;
export type PageKeyValue = (typeof PAGE_KEYS)[number];

const uniqueLocales = <T extends { locale: string }>(arr: T[]) => new Set(arr.map((t) => t.locale)).size === arr.length;
const uniqueLocalesMsg = { message: "Each language may appear only once" };

/** Lucide icon name in kebab-case, as used by `lucide-react/dynamic` (e.g. "graduation-cap"). */
export const iconNameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(50)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a Lucide icon name such as graduation-cap");

/** Internal path ("/tet/membership", "/news") or an absolute https URL. */
export const ctaHrefSchema = z
  .string()
  .trim()
  .max(255)
  .refine((v) => {
    if (/^\/(?!\/)[A-Za-z0-9\-._~/?#[\]@!$&'()*+,;=%]*$/.test(v)) return true;
    try {
      return new URL(v).protocol === "https:";
    } catch {
      return false;
    }
  }, "Use an internal path starting with / or an https:// link");

// ---------------------------------------------------------------- Page sections
export const sectionTranslationSchema = z.object({
  locale: localeEnumSchema,
  title: z.string().trim().min(2).max(220),
  contentHtml: z.string().max(200_000).default(""),
  contentJson: z.unknown().optional(),
});

export const sectionCreateSchema = z.object({
  page: z.enum(PAGE_KEYS),
  icon: z.preprocess((v) => (v === "" || v === null ? undefined : v), iconNameSchema.optional()),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  isVisible: z.boolean().default(true),
  translations: z.array(sectionTranslationSchema).min(1, "At least one language is required").max(4).refine(uniqueLocales, uniqueLocalesMsg),
});
export type SectionCreateInput = z.infer<typeof sectionCreateSchema>;

export const sectionUpdateSchema = z.object({
  icon: z.preprocess((v) => (v === "" ? null : v), iconNameSchema.nullable().optional()),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  isVisible: z.boolean().optional(),
  translations: z.array(sectionTranslationSchema).max(4).refine(uniqueLocales, uniqueLocalesMsg).optional(),
  removeLocales: z.array(localeEnumSchema).max(3).optional(),
});
export type SectionUpdateInput = z.infer<typeof sectionUpdateSchema>;

export const reorderSchema = z.object({
  ids: z.array(z.string().cuid()).min(1).max(200),
});

export const sectionListSchema = z.object({ page: z.enum(PAGE_KEYS).optional() });

// ---------------------------------------------------------------- Hero slides
export const heroTranslationSchema = z.object({
  locale: localeEnumSchema,
  headline: z.string().trim().min(2).max(160),
  subline: optionalText(300),
  ctaLabel: optionalText(60),
});

const heroBase = {
  imageId: z.string().cuid().nullable().optional(),
  ctaHref: z.preprocess((v) => (v === "" ? null : v), ctaHrefSchema.nullable().optional()),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  isActive: z.boolean().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
};

const windowOk = (v: { startsAt?: Date | null; endsAt?: Date | null }) => !v.startsAt || !v.endsAt || v.endsAt > v.startsAt;
const windowMsg = { message: "End must be after start", path: ["endsAt"] };

export const heroCreateSchema = z
  .object({
    ...heroBase,
    translations: z.array(heroTranslationSchema).min(1, "At least one language is required").max(4).refine(uniqueLocales, uniqueLocalesMsg),
  })
  .refine(windowOk, windowMsg);
export type HeroCreateInput = z.infer<typeof heroCreateSchema>;

export const heroUpdateSchema = z
  .object({
    ...heroBase,
    translations: z.array(heroTranslationSchema).max(4).refine(uniqueLocales, uniqueLocalesMsg).optional(),
    removeLocales: z.array(localeEnumSchema).max(3).optional(),
  })
  .refine(windowOk, windowMsg);
export type HeroUpdateInput = z.infer<typeof heroUpdateSchema>;

// ---------------------------------------------------------------- Albums
export const albumTranslationSchema = z.object({
  locale: localeEnumSchema,
  title: z.string().trim().min(2).max(220),
  description: optionalText(2000),
});

export const albumCreateSchema = z.object({
  slug: slugSchema.optional(),
  coverId: z.string().cuid().optional(),
  translations: z.array(albumTranslationSchema).min(1, "At least one language is required").max(4).refine(uniqueLocales, uniqueLocalesMsg),
});
export type AlbumCreateInput = z.infer<typeof albumCreateSchema>;

export const albumUpdateSchema = z.object({
  slug: slugSchema.optional(),
  coverId: z.string().cuid().nullable().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  translations: z.array(albumTranslationSchema).max(4).refine(uniqueLocales, uniqueLocalesMsg).optional(),
  removeLocales: z.array(localeEnumSchema).max(3).optional(),
});
export type AlbumUpdateInput = z.infer<typeof albumUpdateSchema>;

const captionSchema = z.record(z.enum(["tet", "pt", "id", "en"]), z.string().trim().max(300));

export const albumItemsSchema = z.object({
  items: z
    .array(z.object({ mediaId: z.string().cuid(), caption: captionSchema.optional() }))
    .max(500)
    .refine((arr) => new Set(arr.map((i) => i.mediaId)).size === arr.length, { message: "Each item may appear only once" }),
});

// ---------------------------------------------------------------- Site settings
const nullableUrl = z
  .string()
  .trim()
  .max(300)
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => {
    if (v === null) return true;
    try {
      return new URL(v).protocol === "https:";
    } catch {
      return false;
    }
  }, "Use an https:// link");

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v ? v : null));

const localizedText = (max: number) =>
  z.object({
    tet: z.string().trim().min(1).max(max),
    pt: z.string().trim().min(1).max(max),
    id: z.string().trim().min(1).max(max),
    en: z.string().trim().min(1).max(max),
  });

/**
 * Settings editable from the backoffice, each with its own schema. Keys not
 * listed here (brand colours, locales…) are deployment-level and read-only.
 */
export const SETTING_SCHEMAS = {
  "site.name": localizedText(120),
  "site.shortName": z.string().trim().min(1).max(20),
  "site.motto": z.string().trim().min(1).max(160),
  "contact.headquarters": z.object({
    address: nullableText(255),
    phone: nullableText(32),
    email: z
      .string()
      .trim()
      .max(160)
      .nullable()
      .transform((v) => (v ? v.toLowerCase() : null))
      .refine((v) => v === null || z.email().safeParse(v).success, "Invalid e-mail address"),
    whatsapp: nullableText(32),
  }),
  "social.links": z.object({
    facebook: nullableUrl,
    youtube: nullableUrl,
    instagram: nullableUrl,
    tiktok: nullableUrl,
    x: nullableUrl,
  }),
  "membership.consentVersion": z.string().trim().min(1).max(20),
  "membership.minimumAge": z.number().int().min(14).max(30),
  "membership.requireIdScan": z.boolean(),
  "kta.validityYears": z.number().int().min(1).max(20),
  "aspiration.autoAcknowledge": z.boolean(),
} as const;

export type SettingKey = keyof typeof SETTING_SCHEMAS;
export const SETTING_KEYS = Object.keys(SETTING_SCHEMAS) as SettingKey[];

/** Keys whose change affects members' rights or card validity — audited as WARNING. */
export const SENSITIVE_SETTING_KEYS: SettingKey[] = [
  "membership.consentVersion",
  "membership.minimumAge",
  "membership.requireIdScan",
  "kta.validityYears",
];

export const settingsUpdateSchema = z.object({
  values: z
    .record(z.string(), z.unknown())
    .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" })
    .refine((v) => Object.keys(v).every((k) => k in SETTING_SCHEMAS), { message: "Unknown or read-only setting" }),
});
