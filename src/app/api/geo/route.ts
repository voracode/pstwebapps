import { z } from "zod";
import { ok, parseQuery, publicRoute } from "@/lib/http";
import { optionalInt } from "@/lib/validation/common";
import { listGeo } from "@/server/services/geo.service";

const schema = z.object({
  level: z.enum(["municipality", "adminPost", "suco", "aldeia"]).default("municipality"),
  parentId: optionalInt,
});

/**
 * GET /api/geo?level=municipality
 * GET /api/geo?level=adminPost&parentId=<municipalityId>  (then suco, aldeia)
 * Cascading dropdown data for the registration form; cached for a day.
 */
export const GET = publicRoute(async ({ req }) => {
  const { level, parentId } = parseQuery(req, schema);
  const res = ok(await listGeo(level, parentId));
  res.headers.set("cache-control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800");
  return res;
});
