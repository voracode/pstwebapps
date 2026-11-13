import { z } from "zod";
import { ok, parseQuery, publicRoute } from "@/lib/http";
import { localeSchema } from "@/lib/validation/common";
import { municipalDirectory } from "@/server/services/content.service";

/** GET /api/public/municipalities — directory: 14 municípios, offices, coordinators, map coordinates. */
export const GET = publicRoute(async ({ req }) => {
  const { locale } = parseQuery(req, z.object({ locale: localeSchema.default("tet") }));
  const res = ok(await municipalDirectory(locale));
  res.headers.set("cache-control", "public, max-age=300, s-maxage=600, stale-while-revalidate=3600");
  return res;
});
