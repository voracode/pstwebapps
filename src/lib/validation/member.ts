import { z } from "zod";
import {
  booleanish,
  dateOnly,
  optionalInt,
  optionalPhone,
  optionalText,
  phoneSchema,
  requiredInt,
  requiredText,
} from "./common";

export const GENDERS = ["MALE", "FEMALE"] as const;
export const ID_DOC_TYPES = ["BILHETE_IDENTIDADE", "CARTAO_ELEITORAL", "PASSPORT", "OTHER"] as const;
export const EDUCATION_LEVELS = [
  "NONE",
  "PRIMARY",
  "PRE_SECONDARY",
  "SECONDARY",
  "VOCATIONAL",
  "DIPLOMA",
  "BACHELOR",
  "MASTER",
  "DOCTORATE",
] as const;
export const MEMBER_STATUSES = ["PENDING", "VERIFIED", "REJECTED", "SUSPENDED"] as const;
export const MEMBER_RANKS = ["SYMPATHIZER", "MILITANT", "CADRE"] as const;

export const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(160)
  .optional()
  .transform((v) => (v ? v : undefined))
  .pipe(z.email({ message: "Invalid e-mail address" }).optional());

const idNumber = z
  .string()
  .trim()
  .min(4)
  .max(40)
  .regex(/^[A-Za-z0-9 .\-/]+$/, "ID number may only contain letters, digits, spaces, dots and dashes");

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined))
    .pipe(z.enum(values).optional());

/** Fields shared by every way a member record is created. */
const base = {
  fullName: requiredText(3, 180),
  gender: z.enum(GENDERS),
  birthDate: dateOnly,
  birthPlace: optionalText(120),
  idDocumentType: z.enum(ID_DOC_TYPES).default("BILHETE_IDENTIDADE"),
  occupation: optionalText(160),
  educationLevel: optionalEnum(EDUCATION_LEVELS),
  email: optionalEmail,
  municipalityId: requiredInt,
  adminPostId: optionalInt,
  sucoId: optionalInt,
  aldeiaId: optionalInt,
  addressLine: optionalText(255),
  motivation: optionalText(2000),
};

/** Public E-KTA registration form (multipart fields). */
export const publicRegistrationSchema = z.object({
  ...base,
  idNumber,
  phone: phoneSchema,
  consent: booleanish.refine((v) => v === true, { message: "Consent is required" }),
  turnstileToken: z.string().optional(),
});
export type PublicRegistrationInput = z.infer<typeof publicRegistrationSchema>;

/** Backoffice creation (field officers may lack an ID number or phone). */
export const adminCreateMemberSchema = z.object({
  ...base,
  idNumber: idNumber.optional().or(z.literal("").transform(() => undefined)),
  phone: optionalPhone,
  rank: optionalEnum(MEMBER_RANKS),
  joinedAt: dateOnly.optional().or(z.literal("").transform(() => undefined)),
});
export type AdminCreateMemberInput = z.infer<typeof adminCreateMemberSchema>;

export const updateMemberSchema = z
  .object({
    fullName: requiredText(3, 180),
    gender: z.enum(GENDERS),
    birthDate: dateOnly,
    birthPlace: z.string().trim().max(120).nullable(),
    idDocumentType: z.enum(ID_DOC_TYPES),
    idNumber: idNumber.nullable(),
    occupation: z.string().trim().max(160).nullable(),
    educationLevel: z.enum(EDUCATION_LEVELS).nullable(),
    phone: z.string().trim().nullable(),
    email: z.string().trim().toLowerCase().max(160).pipe(z.email()).nullable(),
    municipalityId: z.number().int().positive(),
    adminPostId: z.number().int().positive().nullable(),
    sucoId: z.number().int().positive().nullable(),
    aldeiaId: z.number().int().positive().nullable(),
    addressLine: z.string().trim().max(255).nullable(),
    motivation: z.string().trim().max(2000).nullable(),
    rank: z.enum(MEMBER_RANKS),
    joinedAt: dateOnly.nullable(),
  })
  .partial()
  .strict();
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

export const statusChangeSchema = z.object({
  status: z.enum(MEMBER_STATUSES),
  reason: z.string().trim().max(1000).optional(),
});

export const memberListSchema = z.object({
  q: optionalText(100),
  status: optionalEnum(MEMBER_STATUSES),
  rank: optionalEnum(MEMBER_RANKS),
  gender: optionalEnum(GENDERS),
  channel: optionalEnum(["ONLINE", "FIELD_IMPORT", "BACKOFFICE", "LEGACY_MIGRATION"] as const),
  municipalityId: optionalInt,
  adminPostId: optionalInt,
  sucoId: optionalInt,
  aldeiaId: optionalInt,
  ageMin: optionalInt,
  ageMax: optionalInt,
  createdFrom: dateOnly.optional(),
  createdTo: dateOnly.optional(),
  sort: z.enum(["createdAt", "-createdAt", "fullName", "-fullName", "memberNumber", "-memberNumber"]).default("-createdAt"),
});
export type MemberListFilter = z.infer<typeof memberListSchema>;

export const statusCheckSchema = z.object({
  registrationRef: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^REG-[0-9A-Z]{8}$/, "Invalid reference"),
  birthDate: dateOnly,
});
