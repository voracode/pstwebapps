import { z } from "zod";
import { adminRoute, created, ok, pageMeta, paginate, paginationSchema, parseJson, parseQuery } from "@/lib/http";
import { optionalInt } from "@/lib/validation/common";
import { EVENT_STATUSES, EVENT_TYPES, eventCreateSchema } from "@/lib/validation/content";
import { createEvent, listEventsAdmin } from "@/server/services/event.service";

const listSchema = paginationSchema.extend({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  type: z.enum(EVENT_TYPES).optional(),
  status: z.enum(EVENT_STATUSES).optional(),
  municipalityId: optionalInt,
});

export const GET = adminRoute({ permission: "event:read" }, async ({ req, auth }) => {
  const q = parseQuery(req, listSchema);
  const { skip, take } = paginate(q.page, q.pageSize);
  const { items, total } = await listEventsAdmin(auth, q, skip, take);
  return ok({ items, meta: pageMeta(total, q.page, q.pageSize) });
});

export const POST = adminRoute({ permission: "event:write" }, async ({ req, auth, ctx }) =>
  created(await createEvent(auth, await parseJson(req, eventCreateSchema), ctx)),
);
