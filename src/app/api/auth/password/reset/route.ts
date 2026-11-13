import { z } from "zod";
import { ok, parseJson, publicRoute } from "@/lib/http";
import { resetPasswordWithToken } from "@/server/services/auth.service";

const schema = z.object({
  token: z.string().min(20).max(100),
  newPassword: z.string().min(1).max(256),
});

/** POST /api/auth/password/reset — completes a reset or an invitation link. */
export const POST = publicRoute(async ({ req, ctx }) => {
  const { token, newPassword } = await parseJson(req, schema);
  await resetPasswordWithToken(token, newPassword, ctx);
  return ok({ reset: true });
});
