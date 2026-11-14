import { adminRoute, ok, paramStr, parseJson } from "@/lib/http";
import { sectionUpdateSchema } from "@/lib/validation/site";
import { deleteSection, getSection, updateSection } from "@/server/services/site.service";

type P = { id: string };

export const GET = adminRoute<P>({ permission: "post:read" }, async ({ params }) => ok(await getSection(paramStr(params.id))));

export const PATCH = adminRoute<P>({ permission: "post:write" }, async ({ req, params, auth, ctx }) =>
  ok(await updateSection(auth, paramStr(params.id), await parseJson(req, sectionUpdateSchema), ctx)),
);

export const DELETE = adminRoute<P>({ permission: "post:write" }, async ({ params, auth, ctx }) => {
  await deleteSection(auth, paramStr(params.id), ctx);
  return ok({ deleted: true });
});
