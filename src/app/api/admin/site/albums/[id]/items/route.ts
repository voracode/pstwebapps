import { adminRoute, ok, paramStr, parseJson } from "@/lib/http";
import { albumItemsSchema } from "@/lib/validation/site";
import { setAlbumItems } from "@/server/services/site.service";

type P = { id: string };

/** PUT /api/admin/site/albums/:id/items — { items: [{ mediaId, caption? }] } replaces the list (array order = display order). */
export const PUT = adminRoute<P>({ permission: "post:write" }, async ({ req, params, auth, ctx }) => {
  const { items } = await parseJson(req, albumItemsSchema);
  return ok(await setAlbumItems(auth, paramStr(params.id), items as { mediaId: string; caption?: Record<string, string> }[], ctx));
});
