import { z } from "zod";
import { adminRoute, ok, pageMeta, paginate, paginationSchema, parseQuery } from "@/lib/http";
import { booleanish, optionalInt, optionalText } from "@/lib/validation/common";
import { ASPIRATION_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from "@/lib/validation/content";
import { listAspirations } from "@/server/services/aspiration.service";

const listSchema = paginationSchema.extend({
  status: z.enum(TICKET_STATUSES).optional(),
  category: z.enum(ASPIRATION_CATEGORIES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  municipalityId: optionalInt,
  assignedToMe: booleanish,
  q: optionalText(100),
});

export const GET = adminRoute({ permission: "aspiration:read" }, async ({ req, auth }) => {
  const q = parseQuery(req, listSchema);
  const { skip, take } = paginate(q.page, q.pageSize);
  const { items, total } = await listAspirations(auth, q, skip, take);
  return ok({ items, meta: pageMeta(total, q.page, q.pageSize) });
});
