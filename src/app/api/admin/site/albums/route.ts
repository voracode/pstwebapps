import { adminRoute, created, ok, pageMeta, paginate, paginationSchema, parseJson, parseQuery } from "@/lib/http";
import { albumCreateSchema } from "@/lib/validation/site";
import { createAlbum, listAlbums } from "@/server/services/site.service";

export const GET = adminRoute({ permission: "post:read" }, async ({ req }) => {
  const q = parseQuery(req, paginationSchema);
  const { skip, take } = paginate(q.page, q.pageSize);
  const { items, total } = await listAlbums(skip, take);
  return ok({ items, meta: pageMeta(total, q.page, q.pageSize) });
});

/** POST /api/admin/site/albums — { slug?, coverId?, translations[] } (created as DRAFT) */
export const POST = adminRoute({ permission: "post:write" }, async ({ req, auth, ctx }) =>
  created(await createAlbum(auth, await parseJson(req, albumCreateSchema), ctx)),
);
