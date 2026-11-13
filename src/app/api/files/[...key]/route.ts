import { NextResponse } from "next/server";
import { getObject, isValidKey, mimeFromKey, verifySignedUrl } from "@/lib/storage";
import { notFound, publicRoute, ApiError } from "@/lib/http";

type P = { key: string[] };

/**
 * GET /api/files/<key>
 *  - private/... requires a valid ?exp=&sig= signature (see signedUrl()).
 *  - public/...  is normally served by Nginx; this path is the fallback
 *    for development or when the proxy isn't in front.
 */
export const GET = publicRoute<P>(async ({ req, params }) => {
  const key = (params.key ?? []).join("/");
  if (!isValidKey(key)) throw notFound("File");

  const isPrivate = key.startsWith("private/");
  if (isPrivate) {
    const sp = req.nextUrl.searchParams;
    if (!verifySignedUrl(key, sp.get("exp"), sp.get("sig"))) {
      throw new ApiError(403, "INVALID_SIGNATURE", "Link expired or invalid");
    }
  }

  let data: Buffer;
  try {
    data = await getObject(key);
  } catch {
    throw notFound("File");
  }

  const mime = mimeFromKey(key);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "content-type": mime,
      "content-length": String(data.length),
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "cache-control": isPrivate ? "private, no-store" : "public, max-age=31536000, immutable",
      ...(mime === "application/pdf" || mime.startsWith("image/") ? {} : { "content-disposition": "attachment" }),
    },
  });
});
