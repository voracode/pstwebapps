import { blindIndex } from "@/lib/security/crypto";
import { rateLimit } from "@/lib/security/rate-limit";
import { ok, publicRoute, tooMany } from "@/lib/http";
import { verifyByQrToken } from "@/server/services/kta.service";

type P = { token: string };

/**
 * GET /api/verify/:token — public KTA verification (target of the card QR).
 * Returns only what is printed on the card plus validity; never contact
 * details or ID numbers.
 */
export const GET = publicRoute<P>(async ({ params, ctx }) => {
  const rl = await rateLimit("verify", blindIndex("ip", ctx.ip ?? "unknown"), { limit: 60, windowSec: 600 });
  if (!rl.allowed) throw tooMany(rl.retryAfterSec);

  const token = String(params.token ?? "");
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return ok({ valid: false, reason: "NOT_FOUND" });

  const res = ok(await verifyByQrToken(token));
  res.headers.set("cache-control", "no-store");
  res.headers.set("x-robots-tag", "noindex");
  return res;
});
