import { adminRoute, created, parseJson } from "@/lib/http";
import { branchSchema } from "@/lib/validation/content";
import { upsertBranch } from "@/server/services/content.service";

export const POST = adminRoute({ permission: "leadership:write" }, async ({ req, auth, ctx }) =>
  created(await upsertBranch(auth, null, await parseJson(req, branchSchema), ctx)),
);
