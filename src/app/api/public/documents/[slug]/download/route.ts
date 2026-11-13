import { NextResponse } from "next/server";
import { z } from "zod";
import { paramStr, parseQuery, publicRoute } from "@/lib/http";
import { localeSchema } from "@/lib/validation/common";
import { documentDownloadUrl } from "@/server/services/content.service";

type P = { slug: string };

/** GET → 302 to the PDF in the requested language (falls back), counting the download. */
export const GET = publicRoute<P>(async ({ req, params }) => {
  const { locale } = parseQuery(req, z.object({ locale: localeSchema.default("tet") }));
  const url = await documentDownloadUrl(paramStr(params.slug, "slug"), locale);
  return NextResponse.redirect(new URL(url, req.nextUrl.origin), { status: 302, headers: { "cache-control": "no-store" } });
});
