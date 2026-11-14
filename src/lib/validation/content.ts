import { z } from "zod";
import { localeEnumSchema, optionalText, slugSchema } from "./common";

/** Update field that can be cleared: "" or null → null, absent → unchanged. */
const clearableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null));

/** Date that may be explicitly null (cleared); z.coerce alone would turn null into 1970. */
const nullableDate = z.union([z.null(), z.coerce.date()]).optional();

export const POST_TYPES = ["NEWS", "PRESS_RELEASE", "ARTICLE", "STATEMENT"] as const;
export const PUBLISH_STATUSES = ["DRAFT", "IN_REVIEW", "SCHEDULED", "PUBLISHED", "ARCHIVED"] as const;
export const DOCUMENT_TYPES = ["STATUTE", "POLITICAL_PROGRAM", "MANIFESTO", "BULLETIN", "LEGISLATION", "RESOLUTION", "REPORT", "OTHER"] as const;
export const EVENT_TYPES = ["CONGRESS", "RALLY", "COMMUNITY_DISCUSSION", "POLITICAL_EDUCATION", "MEETING", "OTHER"] as const;
export const EVENT_STATUSES = ["DRAFT", "SCHEDULED", "ONGOING", "COMPLETED", "POSTPONED", "CANCELLED"] as const;
export const LEADERSHIP_LEVELS = ["PRESIDENCY", "POLITICAL_COMMISSION", "CENTRAL_COMMITTEE", "NATIONAL_SECRETARIAT", "MUNICIPAL_COMMITTEE", "WING"] as const;

const translationsArray = <T extends z.ZodType<{ locale: string }>>(item: T) =>
  z
    .array(item)
    .min(1, "At least one language is required")
    .max(4)
    .refine((arr) => new Set(arr.map((t) => t.locale)).size === arr.length, {
      message: "Each language may appear only once",
    });

// ---------------------------------------------------------------- Posts
export const postTranslationSchema = z.object({
  locale: localeEnumSchema,
  title: z.string().trim().min(3).max(220),
  slug: slugSchema.optional(),
  excerpt: optionalText(600),
  contentJson: z.unknown().optional(),
  contentHtml: z.string().max(500_000).optional(),
  seoTitle: optionalText(70),
  seoDescription: optionalText(170),
});

export const postCreateSchema = z.object({
  type: z.enum(POST_TYPES).default("NEWS"),
  categoryId: z.string().cuid().optional(),
  municipalityId: z.number().int().positive().optional(),
  coverId: z.string().cuid().optional(),
  attachmentId: z.string().cuid().optional(),
  byline: optionalText(160),
  isFeatured: z.boolean().default(false),
  pinnedToHero: z.boolean().default(false),
  tags: z.array(z.string().trim().min(1).max(60)).max(15).default([]),
  translations: translationsArray(postTranslationSchema),
});
export type PostCreateInput = z.infer<typeof postCreateSchema>;

export const postUpdateSchema = z.object({
  type: z.enum(POST_TYPES).optional(),
  categoryId: z.string().cuid().nullable().optional(),
  municipalityId: z.number().int().positive().nullable().optional(),
  coverId: z.string().cuid().nullable().optional(),
  attachmentId: z.string().cuid().nullable().optional(),
  byline: z.string().trim().max(160).nullable().optional(),
  isFeatured: z.boolean().optional(),
  pinnedToHero: z.boolean().optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(15).optional(),
  translations: z.array(postTranslationSchema).max(4).optional(),
  removeLocales: z.array(localeEnumSchema).max(3).optional(),
});
export type PostUpdateInput = z.infer<typeof postUpdateSchema>;

export const postWorkflowSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("submit_review") }),
  z.object({ action: z.literal("publish") }),
  z.object({ action: z.literal("schedule"), scheduledAt: z.coerce.date() }),
  z.object({ action: z.literal("unpublish") }),
  z.object({ action: z.literal("archive") }),
]);

// ---------------------------------------------------------------- Documents
export const documentTranslationSchema = z.object({
  locale: localeEnumSchema,
  title: z.string().trim().min(3).max(220),
  description: optionalText(2000),
  fileId: z.string().cuid().optional(),
});

export const documentCreateSchema = z.object({
  type: z.enum(DOCUMENT_TYPES),
  slug: slugSchema.optional(),
  versionLabel: optionalText(40),
  isPublic: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  publishedAt: z.coerce.date().optional(),
  translations: translationsArray(documentTranslationSchema),
});

export const documentUpdateSchema = documentCreateSchema
  .omit({ translations: true })
  .partial()
  .extend({
    versionLabel: clearableText(40),
    translations: z.array(documentTranslationSchema).max(4).optional(),
    removeLocales: z.array(localeEnumSchema).max(3).optional(),
  });

// ---------------------------------------------------------------- Events
export const eventTranslationSchema = z.object({
  locale: localeEnumSchema,
  title: z.string().trim().min(3).max(220),
  summary: optionalText(400),
  contentHtml: z.string().max(200_000).optional(),
});

const eventBase = {
  type: z.enum(EVENT_TYPES),
  status: z.enum(EVENT_STATUSES).default("SCHEDULED"),
  isPublic: z.boolean().default(true),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().optional(),
  municipalityId: z.number().int().positive().optional(),
  sucoId: z.number().int().positive().optional(),
  venue: optionalText(200),
  latitude: z.number().min(-10).max(-8).optional(),
  longitude: z.number().min(124).max(128).optional(),
  coverId: z.string().cuid().optional(),
  capacity: z.number().int().positive().optional(),
  expectedTurnout: z.number().int().positive().optional(),
};

export const eventCreateSchema = z
  .object({ ...eventBase, slug: slugSchema.optional(), translations: translationsArray(eventTranslationSchema) })
  .refine((e) => !e.endsAt || e.endsAt >= e.startsAt, { message: "endsAt must be after startsAt", path: ["endsAt"] });

export const eventUpdateSchema = z
  .object(eventBase)
  .partial()
  .extend({
    endsAt: z.coerce.date().nullable().optional(),
    municipalityId: z.number().int().positive().nullable().optional(),
    sucoId: z.number().int().positive().nullable().optional(),
    venue: z.string().trim().max(200).nullable().optional(),
    capacity: z.number().int().positive().nullable().optional(),
    expectedTurnout: z.number().int().positive().nullable().optional(),
    translations: z.array(eventTranslationSchema).max(4).optional(),
    removeLocales: z.array(localeEnumSchema).max(3).optional(),
  });

export const attendanceSchema = z
  .object({
    qrToken: z.string().trim().min(20).max(64).optional(),
    memberNumber: z.string().trim().toUpperCase().regex(/^PST-[A-Z]{2}-\d{4}-\d{6}$/).optional(),
    guestName: optionalText(180),
    guestPhone: optionalText(32),
    guestGender: z.enum(["MALE", "FEMALE"]).optional(),
  })
  .refine((v) => !!(v.qrToken || v.memberNumber || v.guestName), { message: "Provide a member QR, member number or guest name" });

// ---------------------------------------------------------------- Leadership & branches
export const leadershipTranslationSchema = z.object({
  locale: localeEnumSchema,
  positionTitle: z.string().trim().min(2).max(220),
  bio: optionalText(5000),
});

export const leadershipCreateSchema = z.object({
  level: z.enum(LEADERSHIP_LEVELS),
  municipalityId: z.number().int().positive().optional(),
  memberId: z.string().cuid().optional(),
  fullName: z.string().trim().min(3).max(180),
  photoId: z.string().cuid().optional(),
  phone: optionalText(32),
  email: optionalText(160),
  isCoordinator: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
  termStart: nullableDate,
  termEnd: nullableDate,
  isActive: z.boolean().default(true),
  translations: translationsArray(leadershipTranslationSchema),
});

export const leadershipUpdateSchema = leadershipCreateSchema
  .omit({ translations: true })
  .partial()
  .extend({
    municipalityId: z.number().int().positive().nullable().optional(),
    memberId: z.string().cuid().nullable().optional(),
    photoId: z.string().cuid().nullable().optional(),
    phone: clearableText(32),
    email: clearableText(160),
    translations: z.array(leadershipTranslationSchema).max(4).optional(),
    removeLocales: z.array(localeEnumSchema).max(3).optional(),
  });

export const branchSchema = z.object({
  municipalityId: z.number().int().positive(),
  adminPostId: z.number().int().positive().nullable().optional(),
  coordinatorId: z.string().cuid().nullable().optional(),
  name: z.string().trim().min(3).max(160),
  address: z.string().trim().max(255).nullable().optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  email: z.string().trim().max(160).nullable().optional(),
  latitude: z.number().min(-10).max(-8).nullable().optional(),
  longitude: z.number().min(124).max(128).nullable().optional(),
  openingHours: z.record(z.string(), z.string().max(200)).nullable().optional(),
  isHeadquarters: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

// ---------------------------------------------------------------- Aspirations & contact
export const ASPIRATION_CATEGORIES = [
  "LAND_PROPERTY", "AGRICULTURE_FISHERIES", "LABOUR_EMPLOYMENT", "EDUCATION", "HEALTH", "INFRASTRUCTURE",
  "WATER_SANITATION", "ELECTRICITY", "SOCIAL_PROTECTION", "CORRUPTION_GOVERNANCE", "YOUTH", "WOMEN_GENDER", "VETERANS", "OTHER",
] as const;
export const SUBMITTER_TYPES = ["CITIZEN", "WORKER", "FARMER", "FISHER", "STUDENT", "VETERAN", "PARTY_MEMBER", "OTHER"] as const;
export const TICKET_STATUSES = ["NEW", "ACKNOWLEDGED", "IN_REVIEW", "FORWARDED", "RESOLVED", "CLOSED", "SPAM"] as const;
export const TICKET_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
