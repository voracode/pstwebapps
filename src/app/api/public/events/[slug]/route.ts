import { z } from "zod";
import { ok, paramStr, parseQuery, publicRoute } from "@/lib/http";
import { localeSchema } from "@/lib/validation/common";
import { PUBLIC_CACHE } from "@/lib/validation/public";
import { getEventPublic } from "@/server/services/event.service";

type P = { slug: string };

export const GET = publicRoute<P>(async ({ req, params }) => {
  const { locale } = parseQuery(req, z.object({ locale: localeSchema.default("tet") }));
  const res = ok(await getEventPublic(locale, paramStr(params.slug, "slug")));
  res.headers.set("cache-control", PUBLIC_CACHE);
  return res;
});
