import { z } from "zod";
import { adminRoute, created, ok, pageMeta, paginate, paginationSchema, parseJson, parseQuery } from "@/lib/http";
import { DOCUMENT_TYPES, documentCreateSchema } from "@/lib/validation/content";
import { createDocument, listDocumentsAdmin } from "@/server/services/content.service";

const listSchema = paginationSchema.extend({ type: z.enum(DOCUMENT_TYPES).optional() });

export const GET = adminRoute({ permission: "post:read" }, async ({ req }) => {
  const q = parseQuery(req, listSchema);
  const { skip, take } = paginate(q.page, q.pageSize);
  const { items, total } = await listDocumentsAdmin(q, skip, take);
  return ok({ items, meta: pageMeta(total, q.page, q.pageSize) });
});

export const POST = adminRoute({ permission: "document:write" }, async ({ req, auth, ctx }) =>
  created(await createDocument(auth, await parseJson(req, documentCreateSchema), ctx)),
);
