import { adminRoute, ok, paramStr, parseJson } from "@/lib/http";
import { updateMemberSchema } from "@/lib/validation/member";
import { deleteMember, getMember, updateMember } from "@/server/services/member.service";

type P = { id: string };

/** GET /api/admin/members/:id[?reveal=id] — reveal decrypts the ID number (audited). */
export const GET = adminRoute<P>({ permission: "member:read" }, async ({ req, params, auth, ctx }) => {
  const revealId = req.nextUrl.searchParams.get("reveal") === "id";
  return ok(await getMember(auth, paramStr(params.id), { revealId }, ctx));
});

export const PATCH = adminRoute<P>({ permission: "member:update" }, async ({ req, params, auth, ctx }) => {
  const input = await parseJson(req, updateMemberSchema);
  return ok(await updateMember(auth, paramStr(params.id), input, ctx));
});

export const DELETE = adminRoute<P>({ permission: "member:delete" }, async ({ params, auth, ctx }) => {
  await deleteMember(auth, paramStr(params.id), ctx);
  return ok({ deleted: true });
});
