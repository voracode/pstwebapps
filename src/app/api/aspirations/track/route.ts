import { z } from "zod";
import { ok, parseJson, publicRoute, tooMany } from "@/lib/http";
import { blindIndex } from "@/lib/security/crypto";
import { rateLimit } from "@/lib/security/rate-limit";
import { trackAspiration } from "@/server/services/aspiration.service";

const schema = z.object({
  ticketNumber: z.string().trim().toUpperCase().regex(/^ASP-\d{4}-[0-9A-Z]{6}$/),
  trackingCode: z.string().trim().min(12).max(20),
});

/** POST { ticketNumber, trackingCode } → status and public replies. */
export const POST = publicRoute(async ({ req, ctx }) => {
  const rl = await rateLimit("aspiration-track", blindIndex("ip", ctx.ip ?? "unknown"), { limit: 20, windowSec: 3600 });
  if (!rl.allowed) throw tooMany(rl.retryAfterSec);
  const { ticketNumber, trackingCode } = await parseJson(req, schema);
  return ok(await trackAspiration(ticketNumber, trackingCode));
});
