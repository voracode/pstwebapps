import { z } from "zod";
import { adminRoute, created, ok, pageMeta, paginate, paginationSchema, parseJson, parseQuery } from "@/lib/http";
import { optionalText } from "@/lib/validation/common";
import { POST_TYPES, PUBLISH_STATUSES, postCreateSchema } from "@/lib/validation/content";
import { createPost, listPostsAdmin } from "@/server/services/post.service";

const listSchema = paginationSchema.extend({
  type: z.enum(POST_TYPES).optional(),
  status: z.enum(PUBLISH_STATUSES).optional(),
  categoryId: optionalText(40),
  q: optionalText(100),
});

export const GET = adminRoute({ permission: "post:read" }, async ({ req }) => {
  const q = parseQuery(req, listSchema);
  const { skip, take } = paginate(q.page, q.pageSize);
  const { items, total } = await listPostsAdmin(q, skip, take);
  return ok({ items, meta: pageMeta(total, q.page, q.pageSize) });
});

export const POST = adminRoute({ permission: "post:write" }, async ({ req, auth, ctx }) =>
  created(await createPost(auth, await parseJson(req, postCreateSchema), ctx)),
);
