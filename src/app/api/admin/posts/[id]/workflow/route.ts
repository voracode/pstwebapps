import { adminRoute, forbidden, ok, paramStr, parseJson } from "@/lib/http";
import { can } from "@/lib/security/rbac";
import { postWorkflowSchema } from "@/lib/validation/content";
import { postWorkflow } from "@/server/services/post.service";

type P = { id: string };

/** POST { action: submit_review | publish | schedule(scheduledAt) | unpublish | archive } */
export const POST = adminRoute<P>({ permission: "post:write" }, async ({ req, params, auth, ctx }) => {
  const action = await parseJson(req, postWorkflowSchema);
  if (action.action !== "submit_review" && !can(auth.user.role, "post:publish")) throw forbidden("Not allowed to publish");
  return ok(await postWorkflow(auth, paramStr(params.id), action, ctx));
});
