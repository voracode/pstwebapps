import { z } from "zod";
import { adminRoute, ok, parseJson } from "@/lib/http";
import { changePassword } from "@/server/services/auth.service";

const schema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(1).max(256),
});

/** POST /api/auth/password — change own password (also completes forced rotation). */
export const POST = adminRoute(
  { stages: ["ACTIVE", "PASSWORD_CHANGE_REQUIRED", "TWO_FACTOR_SETUP_REQUIRED"] },
  async ({ req, auth, ctx }) => {
    const { currentPassword, newPassword } = await parseJson(req, schema);
    return ok(await changePassword(auth, currentPassword, newPassword, ctx));
  },
);
