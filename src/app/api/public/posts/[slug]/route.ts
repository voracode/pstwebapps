import { z } from "zod";
import { ok, paramStr, parseQuery, publicRoute } from "@/lib/http";
import { localeSchema } from "@/lib/validation/common";
import { PUBLIC_CACHE } from "@/lib/validation/public";
import { getPostPublic, recordView } from "@/server/services/post.service";

type P = { slug: string };

export const GET = publicRoute<P>(async ({ req, params, ctx }) => {
  const { locale } = parseQuery(req, z.object({ locale: localeSchema.default("tet") }));
  const post = await getPostPublic(locale, paramStr(params.slug, "slug"));
  await recordView(post.id, ctx.ip);
  const res = ok(post);
  res.headers.set("cache-control", PUBLIC_CACHE);
  return res;
});
