import { z } from "zod";
import { ok, parseJson, publicRoute } from "@/lib/http";
import { emailSchema } from "@/lib/validation/common";
import { login } from "@/server/services/auth.service";

const schema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
});

/** POST /api/auth/login → { stage } and sets the session cookie. */
export const POST = publicRoute(async ({ req, ctx }) => {
  const { email, password } = await parseJson(req, schema);
  return ok(await login(email, password, ctx));
});
