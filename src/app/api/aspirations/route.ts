import { z } from "zod";
import { env } from "@/env";
import { created, formFields, parseForm, publicRoute, tooMany } from "@/lib/http";
import { blindIndex } from "@/lib/security/crypto";
import { rateLimit } from "@/lib/security/rate-limit";
import { assertHuman } from "@/lib/turnstile";
import { booleanish, localeSchema, localeToEnum, optionalInt, optionalPhone, optionalText, requiredText } from "@/lib/validation/common";
import { ASPIRATION_CATEGORIES, SUBMITTER_TYPES } from "@/lib/validation/content";
import { optionalEmail } from "@/lib/validation/member";
import { submitAspiration } from "@/server/services/aspiration.service";

const schema = z.object({
  category: z.enum(ASPIRATION_CATEGORIES),
  submitterType: z.enum(SUBMITTER_TYPES).default("CITIZEN"),
  isAnonymous: booleanish,
  name: optionalText(180),
  phone: optionalPhone,
  email: optionalEmail,
  municipalityId: optionalInt,
  sucoId: optionalInt,
  subject: requiredText(5, 220),
  message: requiredText(20, 5000),
  locale: localeSchema.default("tet"),
  turnstileToken: z.string().optional(),
});

/**
 * POST /api/aspirations — "Lian Povu / Voz do Povo".
 * multipart: fields above + up to 3 files `attachments` (images or PDF).
 * Response includes the tracking code, shown to the citizen once.
 */
export const POST = publicRoute(async ({ req, ctx }) => {
  const rl = await rateLimit("aspiration", blindIndex("ip", ctx.ip ?? "unknown"), {
    limit: env().RATE_LIMIT_ASPIRATION_PER_HOUR,
    windowSec: 3600,
  });
  if (!rl.allowed) throw tooMany(rl.retryAfterSec);

  const form = await parseForm(req);
  const input = schema.parse(formFields(form));
  await assertHuman(input.turnstileToken, ctx.ip);
  const files = form.getAll("attachments").filter((f): f is File => f instanceof File && f.size > 0);

  return created(await submitAspiration({ ...input, locale: localeToEnum(input.locale) }, files, ctx));
});
