import { z } from "zod";
import { ok, pageMeta, paginate, parseQuery, publicRoute } from "@/lib/http";
import { optionalText } from "@/lib/validation/common";
import { EVENT_TYPES } from "@/lib/validation/content";
import { PUBLIC_CACHE, publicListSchema } from "@/lib/validation/public";
import { listEventsPublic } from "@/server/services/event.service";

const schema = publicListSchema.extend({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  type: z.enum(EVENT_TYPES).optional(),
  municipality: optionalText(80),
});

/** GET /api/public/events?locale=pt&from=2026-11-01&to=2026-12-31 — upcoming agenda by default. */
export const GET = publicRoute(async ({ req }) => {
  const q = parseQuery(req, schema);
  const { skip, take } = paginate(q.page, q.pageSize);
  const { items, total } = await listEventsPublic(q.locale, q, skip, take);
  const res = ok({ items, meta: pageMeta(total, q.page, q.pageSize) });
  res.headers.set("cache-control", PUBLIC_CACHE);
  return res;
});
