import { z } from "zod";
import { adminRoute, ok, parseJson } from "@/lib/http";
import { verifySecondFactor } from "@/server/services/auth.service";

const schema = z
  .object({
    code: z.string().trim().regex(/^\d{6}$/).optional(),
    recoveryCode: z.string().trim().min(10).max(20).optional(),
  })
  .refine((v) => !!v.code !== !!v.recoveryCode, { message: "Provide either code or recoveryCode" });

/** POST /api/auth/2fa/verify — second login step. */
export const POST = adminRoute({ stages: ["TWO_FACTOR_REQUIRED"] }, async ({ req, auth, ctx }) => {
  const input = await parseJson(req, schema);
  return ok(await verifySecondFactor(auth, input, ctx));
});
