import { adminRoute, ok, paramStr, parseJson } from "@/lib/http";
import { albumUpdateSchema } from "@/lib/validation/site";
import { deleteAlbum, getAlbum, updateAlbum } from "@/server/services/site.service";

type P = { id: string };

export const GET = adminRoute<P>({ permission: "post:read" }, async ({ params }) => ok(await getAlbum(paramStr(params.id))));

/** PATCH — { slug?, coverId?, status? (needs post:publish to change), translations?, removeLocales? } */
export const PATCH = adminRoute<P>({ permission: "post:write" }, async ({ req, params, auth, ctx }) =>
  ok(await updateAlbum(auth, paramStr(params.id), await parseJson(req, albumUpdateSchema), ctx)),
);

export const DELETE = adminRoute<P>({ permission: "post:write" }, async ({ params, auth, ctx }) => {
  await deleteAlbum(auth, paramStr(params.id), ctx);
  return ok({ deleted: true });
});
