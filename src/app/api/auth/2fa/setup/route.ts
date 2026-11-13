import { z } from "zod";
import { adminRoute, ok, parseJson } from "@/lib/http";
import { confirmTwoFactorSetup, startTwoFactorSetup } from "@/server/services/auth.service";

const SETUP_STAGES = ["ACTIVE", "TWO_FACTOR_SETUP_REQUIRED"] as const;

/** GET /api/auth/2fa/setup — new secret + otpauth URI + QR (valid 10 min). */
export const GET = adminRoute({ stages: [...SETUP_STAGES] }, async ({ auth }) => ok(await startTwoFactorSetup(auth)));

const confirmSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/) });

/** POST /api/auth/2fa/setup — confirm with a code; returns one-time recovery codes. */
export const POST = adminRoute({ stages: [...SETUP_STAGES] }, async ({ req, auth, ctx }) => {
  const { code } = await parseJson(req, confirmSchema);
  return ok(await confirmTwoFactorSetup(auth, code, ctx));
});
