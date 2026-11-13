import { z } from "zod";
import { ok, parseQuery, publicRoute } from "@/lib/http";
import { localeSchema, optionalInt } from "@/lib/validation/common";
import { LEADERSHIP_LEVELS } from "@/lib/validation/content";
import { leadershipPublic, listLeadership } from "@/server/services/content.service";

const schema = z.object({
  locale: localeSchema.default("tet"),
  level: z.enum(LEADERSHIP_LEVELS).optional(),
  municipalityId: optionalInt,
});

/** GET /api/public/leadership?level=CENTRAL_COMMITTEE — Comité Central and other organs. */
export const GET = publicRoute(async ({ req }) => {
  const q = parseQuery(req, schema);
  const rows = await listLeadership({ level: q.level, municipalityId: q.municipalityId, activeOnly: true });
  const res = ok(leadershipPublic(rows, q.locale));
  res.headers.set("cache-control", "public, max-age=300, s-maxage=600, stale-while-revalidate=3600");
  return res;
});
