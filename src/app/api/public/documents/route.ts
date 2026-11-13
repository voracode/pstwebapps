import { z } from "zod";
import { ok, pageMeta, paginate, parseQuery, publicRoute } from "@/lib/http";
import { booleanish } from "@/lib/validation/common";
import { DOCUMENT_TYPES } from "@/lib/validation/content";
import { PUBLIC_CACHE, publicListSchema } from "@/lib/validation/public";
import { listDocumentsPublic } from "@/server/services/content.service";

const schema = publicListSchema.extend({ type: z.enum(DOCUMENT_TYPES).optional(), featured: booleanish });

export const GET = publicRoute(async ({ req }) => {
  const q = parseQuery(req, schema);
  const { skip, take } = paginate(q.page, q.pageSize);
  const { items, total } = await listDocumentsPublic(q.locale, q, skip, take);
  const res = ok({ items, meta: pageMeta(total, q.page, q.pageSize) });
  res.headers.set("cache-control", PUBLIC_CACHE);
  return res;
});
