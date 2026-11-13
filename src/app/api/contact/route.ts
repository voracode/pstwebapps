import { z } from "zod";
import { env } from "@/env";
import { created, parseJson, publicRoute, tooMany } from "@/lib/http";
import { blindIndex } from "@/lib/security/crypto";
import { rateLimit } from "@/lib/security/rate-limit";
import { assertHuman } from "@/lib/turnstile";
import { localeSchema, localeToEnum, optionalPhone, optionalText, requiredText } from "@/lib/validation/common";
import { optionalEmail } from "@/lib/validation/member";
import { submitContact } from "@/server/services/aspiration.service";

const schema = z
  .object({
    name: requiredText(2, 160),
    email: optionalEmail,
    phone: optionalPhone,
    subject: optionalText(220),
    message: requiredText(10, 5000),
    locale: localeSchema.default("tet"),
    turnstileToken: z.string().optional(),
    // Honeypot: real users never fill this hidden field.
    website: z.string().max(0).optional(),
  })
  .refine((v) => v.email || v.phone, { message: "Provide an e-mail or phone number", path: ["email"] });

export const POST = publicRoute(async ({ req, ctx }) => {
  const rl = await rateLimit("contact", blindIndex("ip", ctx.ip ?? "unknown"), {
    limit: env().RATE_LIMIT_CONTACT_PER_HOUR,
    windowSec: 3600,
  });
  if (!rl.allowed) throw tooMany(rl.retryAfterSec);
  const { turnstileToken, website: _hp, locale, ...input } = await parseJson(req, schema);
  await assertHuman(turnstileToken, ctx.ip);
  await submitContact({ ...input, locale: localeToEnum(locale) }, ctx);
  return created({ received: true });
});
