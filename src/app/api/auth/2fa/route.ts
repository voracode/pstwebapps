import { z } from "zod";
import { adminRoute, ok, parseJson } from "@/lib/http";
import { disableTwoFactor, regenerateRecoveryCodes } from "@/server/services/auth.service";

const disableSchema = z.object({
  password: z.string().min(1).max(256),
  code: z.string().trim().regex(/^\d{6}$/),
});

/** DELETE /api/auth/2fa — turn off 2FA (not allowed for roles that require it). */
export const DELETE = adminRoute({}, async ({ req, auth, ctx }) => {
  const { password, code } = await parseJson(req, disableSchema);
  await disableTwoFactor(auth, password, code, ctx);
  return ok({ twoFactorEnabled: false });
});

const regenSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/) });

/** POST /api/auth/2fa — regenerate recovery codes (invalidates the old set). */
export const POST = adminRoute({}, async ({ req, auth, ctx }) => {
  const { code } = await parseJson(req, regenSchema);
  return ok(await regenerateRecoveryCodes(auth, code, ctx));
});
