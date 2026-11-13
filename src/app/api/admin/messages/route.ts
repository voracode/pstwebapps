import { adminRoute, ok, pageMeta, paginate, paginationSchema, parseQuery } from "@/lib/http";
import { booleanish } from "@/lib/validation/common";
import { listContactMessages } from "@/server/services/aspiration.service";

const listSchema = paginationSchema.extend({ unread: booleanish, spam: booleanish });

export const GET = adminRoute({ permission: "contact:read" }, async ({ req }) => {
  const q = parseQuery(req, listSchema);
  const { skip, take } = paginate(q.page, q.pageSize);
  const { items, total } = await listContactMessages(q, skip, take);
  return ok({ items, meta: pageMeta(total, q.page, q.pageSize) });
});
