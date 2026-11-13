import { z } from "zod";
import { db } from "@/lib/db";
import { adminRoute, badRequest, notFound, ok, paramStr, parseJson } from "@/lib/http";
import {
  adminResetPassword,
  adminResetTwoFactor,
  deleteUser,
  publicUserSelect,
  unlockUser,
  updateUser,
} from "@/server/services/user.service";

type P = { id: string };
const ROLES = ["SUPER_ADMIN", "NATIONAL_SECRETARY", "MUNICIPAL_COORDINATOR", "MEDIA_EDITOR", "AUDITOR"] as const;

export const GET = adminRoute<P>({ permission: "user:manage" }, async ({ params }) => {
  const user = await db.user.findFirst({ where: { id: paramStr(params.id), deletedAt: null }, select: publicUserSelect });
  if (!user) throw notFound("User");
  return ok(user);
});

const patchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  role: z.enum(ROLES).optional(),
  municipalityId: z.number().int().positive().nullable().optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
  telegramChatId: z.string().trim().regex(/^-?\d{4,20}$/).nullable().optional(),
});

export const PATCH = adminRoute<P>({ permission: "user:manage" }, async ({ req, params, auth, ctx }) => {
  const input = await parseJson(req, patchSchema);
  return ok(await updateUser(auth, paramStr(params.id), input, ctx));
});

export const DELETE = adminRoute<P>({ permission: "user:manage" }, async ({ params, auth, ctx }) => {
  await deleteUser(auth, paramStr(params.id), ctx);
  return ok({ deleted: true });
});

const actionSchema = z.object({ action: z.enum(["reset_password", "reset_2fa", "unlock"]) });

/** POST /api/admin/users/:id  { action } — administrative account actions. */
export const POST = adminRoute<P>({ permission: "user:manage" }, async ({ req, params, auth, ctx }) => {
  const { action } = await parseJson(req, actionSchema);
  const id = paramStr(params.id);
  switch (action) {
    case "reset_password":
      return ok(await adminResetPassword(auth, id, ctx));
    case "reset_2fa":
      await adminResetTwoFactor(auth, id, ctx);
      return ok({ twoFactorEnabled: false });
    case "unlock":
      await unlockUser(auth, id, ctx);
      return ok({ unlocked: true });
    default:
      throw badRequest("Unknown action");
  }
});
