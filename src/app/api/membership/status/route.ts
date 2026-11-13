import { ok, parseJson, publicRoute, tooMany } from "@/lib/http";
import { rateLimit } from "@/lib/security/rate-limit";
import { blindIndex } from "@/lib/security/crypto";
import { statusCheckSchema } from "@/lib/validation/member";
import { checkMembershipStatus } from "@/server/services/member.service";

/** POST /api/membership/status  { registrationRef, birthDate } */
export const POST = publicRoute(async ({ req, ctx }) => {
  const rl = await rateLimit("status-check", blindIndex("ip", ctx.ip ?? "unknown"), { limit: 10, windowSec: 3600 });
  if (!rl.allowed) throw tooMany(rl.retryAfterSec);
  const { registrationRef, birthDate } = await parseJson(req, statusCheckSchema);
  return ok(await checkMembershipStatus(registrationRef, birthDate));
});
