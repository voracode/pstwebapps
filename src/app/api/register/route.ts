import { env } from "@/env";
import { created, formFields, formFile, parseForm, publicRoute, tooMany } from "@/lib/http";
import { rateLimit } from "@/lib/security/rate-limit";
import { blindIndex } from "@/lib/security/crypto";
import { assertHuman } from "@/lib/turnstile";
import { publicRegistrationSchema } from "@/lib/validation/member";
import { registerMember } from "@/server/services/member.service";

/**
 * POST /api/register — public militant registration (E-KTA).
 * multipart/form-data: fields of publicRegistrationSchema + files `photo`, `idScan`.
 * Response: { registrationRef } — the applicant's key for the status check.
 */
export const POST = publicRoute(async ({ req, ctx }) => {
  const rl = await rateLimit("register", blindIndex("ip", ctx.ip ?? "unknown"), {
    limit: env().RATE_LIMIT_REGISTER_PER_HOUR,
    windowSec: 3600,
  });
  if (!rl.allowed) throw tooMany(rl.retryAfterSec);

  const form = await parseForm(req);
  const input = publicRegistrationSchema.parse(formFields(form));
  await assertHuman(input.turnstileToken, ctx.ip);

  const member = await registerMember(
    input,
    { photo: formFile(form, "photo"), idScan: formFile(form, "idScan") },
    { channel: "ONLINE", ctx },
  );
  return created({ registrationRef: member.registrationRef, status: member.status });
});
