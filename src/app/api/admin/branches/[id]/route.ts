import { adminRoute, ok, paramStr, parseJson } from "@/lib/http";
import { branchSchema } from "@/lib/validation/content";
import { deleteBranch, upsertBranch } from "@/server/services/content.service";

type P = { id: string };

export const PUT = adminRoute<P>({ permission: "leadership:write" }, async ({ req, params, auth, ctx }) =>
  ok(await upsertBranch(auth, paramStr(params.id), await parseJson(req, branchSchema), ctx)),
);

export const DELETE = adminRoute<P>({ permission: "leadership:write" }, async ({ params, auth, ctx }) => {
  await deleteBranch(auth, paramStr(params.id), ctx);
  return ok({ deleted: true });
});
