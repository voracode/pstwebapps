import { z } from "zod";
import { ok, parseJson, publicRoute } from "@/lib/http";
import { emailSchema } from "@/lib/validation/common";
import { requestPasswordReset } from "@/server/services/auth.service";

const schema = z.object({ email: emailSchema });

/** POST /api/auth/password/forgot — always 200, never reveals whether the account exists. */
export const POST = publicRoute(async ({ req, ctx }) => {
  const { email } = await parseJson(req, schema);
  await requestPasswordReset(email, ctx);
  return ok({ sent: true });
});
