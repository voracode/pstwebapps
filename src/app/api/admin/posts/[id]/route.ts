import { adminRoute, ok, paramStr, parseJson } from "@/lib/http";
import { postUpdateSchema } from "@/lib/validation/content";
import { deletePost, getPostAdmin, updatePost } from "@/server/services/post.service";

type P = { id: string };

export const GET = adminRoute<P>({ permission: "post:read" }, async ({ params }) => ok(await getPostAdmin(paramStr(params.id))));

export const PATCH = adminRoute<P>({ permission: "post:write" }, async ({ req, params, auth, ctx }) =>
  ok(await updatePost(auth, paramStr(params.id), await parseJson(req, postUpdateSchema), ctx)),
);

export const DELETE = adminRoute<P>({ permission: "post:delete" }, async ({ params, auth, ctx }) => {
  await deletePost(auth, paramStr(params.id), ctx);
  return ok({ deleted: true });
});
