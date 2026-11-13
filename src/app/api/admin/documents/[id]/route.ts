import { adminRoute, ok, paramStr, parseJson } from "@/lib/http";
import { documentUpdateSchema } from "@/lib/validation/content";
import { deleteDocument, updateDocument } from "@/server/services/content.service";

type P = { id: string };

export const PATCH = adminRoute<P>({ permission: "document:write" }, async ({ req, params, auth, ctx }) =>
  ok(await updateDocument(auth, paramStr(params.id), await parseJson(req, documentUpdateSchema), ctx)),
);

export const DELETE = adminRoute<P>({ permission: "document:write" }, async ({ params, auth, ctx }) => {
  await deleteDocument(auth, paramStr(params.id), ctx);
  return ok({ deleted: true });
});
