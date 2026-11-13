import { z } from "zod";
import { ok, pageMeta, paginate, parseQuery, publicRoute } from "@/lib/http";
import { booleanish, optionalText } from "@/lib/validation/common";
import { POST_TYPES } from "@/lib/validation/content";
import { PUBLIC_CACHE, publicListSchema } from "@/lib/validation/public";
import { listPostsPublic } from "@/server/services/post.service";

const schema = publicListSchema.extend({
  type: z.enum(POST_TYPES).optional(),
  category: optionalText(60),
  municipality: optionalText(80),
  featured: booleanish,
  hero: booleanish,
  q: optionalText(100),
});

/** GET /api/public/posts?locale=tet&type=PRESS_RELEASE&page=1 */
export const GET = publicRoute(async ({ req }) => {
  const q = parseQuery(req, schema);
  const { skip, take } = paginate(q.page, q.pageSize);
  const { items, total } = await listPostsPublic(q.locale, q, skip, take);
  const res = ok({ items, meta: pageMeta(total, q.page, q.pageSize) });
  res.headers.set("cache-control", PUBLIC_CACHE);
  return res;
});
