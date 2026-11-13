import { adminRoute, ok, paramStr, parseJson } from "@/lib/http";
import { statusChangeSchema } from "@/lib/validation/member";
import { changeMemberStatus, memberStatusHistory } from "@/server/services/member.service";

type P = { id: string };

/** GET — status history (who approved/rejected/suspended, when, why). */
export const GET = adminRoute<P>({ permission: "member:read" }, async ({ params, auth }) =>
  ok(await memberStatusHistory(auth, paramStr(params.id))),
);

/**
 * POST { status, reason? } — workflow transition.
 * PENDING→VERIFIED assigns the KTA number atomically.
 */
export const POST = adminRoute<P>({ permission: "member:verify" }, async ({ req, params, auth, ctx }) => {
  const { status, reason } = await parseJson(req, statusChangeSchema);
  return ok(await changeMemberStatus(auth, paramStr(params.id), status, reason, ctx));
});
