import { z } from "zod";
import { adminRoute, created, ok, pageMeta, paginate, paginationSchema, parseJson, parseQuery } from "@/lib/http";
import { emailSchema, optionalPhone, optionalText } from "@/lib/validation/common";
import { createUser, listUsers } from "@/server/services/user.service";

const ROLES = ["SUPER_ADMIN", "NATIONAL_SECRETARY", "MUNICIPAL_COORDINATOR", "MEDIA_EDITOR", "AUDITOR"] as const;

const listSchema = paginationSchema.extend({
  role: z.enum(ROLES).optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
  q: optionalText(100),
});

export const GET = adminRoute({ permission: "user:manage" }, async ({ req }) => {
  const q = parseQuery(req, listSchema);
  const { skip, take } = paginate(q.page, q.pageSize);
  const { items, total } = await listUsers(q, skip, take);
  return ok({ items, meta: pageMeta(total, q.page, q.pageSize) });
});

const createSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(2).max(120),
  role: z.enum(ROLES),
  municipalityId: z.number().int().positive().optional(),
  phone: optionalPhone,
  telegramChatId: z.string().trim().regex(/^-?\d{4,20}$/).optional(),
});

/** POST /api/admin/users — creates the account and e-mails an invite link. */
export const POST = adminRoute({ permission: "user:manage" }, async ({ req, auth, ctx }) => {
  const input = await parseJson(req, createSchema);
  return created(await createUser(auth, input, ctx));
});
