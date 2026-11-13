import { z } from "zod";

/**
 * Runtime environment, validated once on first access.
 *
 * Validation is lazy (not at import time) so `next build` and `prisma
 * generate` work in the Docker build stage where secrets are not present.
 */

const bool = (def: boolean) =>
  z
    .enum(["true", "false", "1", "0", ""])
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : v === "true" || v === "1"));

const csv = (def: string) =>
  z
    .string()
    .optional()
    .transform((v) =>
      (v && v.trim() ? v : def)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );

const base64Key = (bytes: number) =>
  z
    .string()
    .min(1)
    .refine((v) => Buffer.from(v, "base64").length === bytes, {
      message: `must be exactly ${bytes} bytes, base64-encoded (openssl rand -base64 ${bytes})`,
    });

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url(),
  TZ: z.string().default("Asia/Dili"),
  TRUST_PROXY: bool(true),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  REDIS_KEY_PREFIX: z.string().default("pst:"),

  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  SESSION_COOKIE_NAME: z.string().default("__Host-pst_session"),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(8),
  SESSION_IDLE_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(30),
  TOTP_ISSUER: z.string().default("PST Backoffice"),
  TWO_FACTOR_REQUIRED_ROLES: csv("SUPER_ADMIN,NATIONAL_SECRETARY,AUDITOR"),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),
  LOGIN_IP_MAX_ATTEMPTS_PER_HOUR: z.coerce.number().int().positive().default(30),
  PASSWORD_HISTORY_DEPTH: z.coerce.number().int().min(0).default(5),
  PASSWORD_MAX_AGE_DAYS: z.coerce.number().int().min(0).default(180),

  DATA_ENCRYPTION_KEY: base64Key(32),
  DATA_ENCRYPTION_KEY_ID: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/).default("k1"),
  DATA_ENCRYPTION_PREVIOUS_KEY: z.string().optional(),
  DATA_ENCRYPTION_PREVIOUS_KEY_ID: z.string().optional(),
  BLIND_INDEX_KEY: z.string().min(1).refine((v) => Buffer.from(v, "base64").length >= 32, {
    message: "BLIND_INDEX_KEY must be at least 32 bytes, base64-encoded",
  }),

  KTA_SIGNING_KEY_ID: z.string().default("kta-1"),
  KTA_SIGNING_PRIVATE_KEY: z.string().optional(),
  KTA_SIGNING_PUBLIC_KEY: z.string().optional(),
  KTA_VERIFY_URL: z.url(),
  KTA_VALIDITY_YEARS: z.coerce.number().int().positive().default(5),

  STORAGE_DRIVER: z.enum(["local"]).default("local"),
  STORAGE_LOCAL_PATH: z.string().default("./storage"),
  STORAGE_PUBLIC_BASE_URL: z.string().default("/media"),
  STORAGE_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  UPLOAD_MAX_IMAGE_MB: z.coerce.number().positive().default(5),
  UPLOAD_MAX_DOCUMENT_MB: z.coerce.number().positive().default(25),

  TELEGRAM_ENABLED: bool(false),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_ADMIN_CHAT_ID: z.string().optional(),
  TELEGRAM_CHAT_ID_REGISTRATIONS: z.string().optional(),
  TELEGRAM_CHAT_ID_ASPIRATIONS: z.string().optional(),
  TELEGRAM_CHAT_ID_SECURITY: z.string().optional(),
  TELEGRAM_CHAT_ID_SYSTEM: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: bool(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default("PST <no-reply@pst.tl>"),
  MAIL_REPLY_TO: z.string().optional(),
  MAIL_ADMIN_INBOX: z.string().optional(),

  TURNSTILE_SECRET_KEY: z.string().optional(),
  RATE_LIMIT_REGISTER_PER_HOUR: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_ASPIRATION_PER_HOUR: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_CONTACT_PER_HOUR: z.coerce.number().int().positive().default(10),

  HEALTHCHECK_TOKEN: z.string().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join("\n")}`);
  }
  cached = parsed.data;
  return cached;
}

export const isProd = () => process.env.NODE_ENV === "production";
