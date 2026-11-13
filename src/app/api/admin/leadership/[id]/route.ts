import { adminRoute, ok, paramStr, parseJson } from "@/lib/http";
import { leadershipUpdateSchema } from "@/lib/validation/content";
import { deleteLeadership, updateLeadership } from "@/server/services/content.service";

type P = { id: string };

export const PATCH = adminRoute<P>({ permission: "leadership:write" }, async ({ req, params, auth, ctx }) =>
  ok(await updateLeadership(auth, paramStr(params.id), await parseJson(req, leadershipUpdateSchema), ctx)),
);

export const DELETE = adminRoute<P>({ permission: "leadership:write" }, async ({ params, auth, ctx }) => {
  await deleteLeadership(auth, paramStr(params.id), ctx);
  return ok({ deleted: true });
});
