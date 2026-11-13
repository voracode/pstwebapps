import { z } from "zod";
import {
  adminRoute,
  badRequest,
  created,
  formFields,
  formFile,
  ok,
  pageMeta,
  paginate,
  paginationSchema,
  parseForm,
  parseQuery,
} from "@/lib/http";
import { optionalText } from "@/lib/validation/common";
import { listMedia, uploadMedia } from "@/server/services/content.service";

const listSchema = paginationSchema.extend({
  kind: z.enum(["IMAGE", "VIDEO", "AUDIO", "DOCUMENT", "VIDEO_EMBED"]).optional(),
  q: optionalText(100),
});

export const GET = adminRoute({ permission: "media:write" }, async ({ req }) => {
  const q = parseQuery(req, listSchema);
  const { skip, take } = paginate(q.page, q.pageSize);
  const { items, total } = await listMedia(q, skip, take);
  return ok({ items, meta: pageMeta(total, q.page, q.pageSize) });
});

const altSchema = z.record(z.enum(["tet", "pt", "id", "en"]), z.string().max(300)).optional();

/** POST multipart: `file`, optional `altText` (JSON {tet,pt,id,en}) and `credit`. */
export const POST = adminRoute({ permission: "media:write" }, async ({ req, auth, ctx }) => {
  const form = await parseForm(req);
  const file = formFile(form, "file");
  if (!file) throw badRequest("file is required");
  const fields = formFields(form);
  let altText: Record<string, string> | undefined;
  try {
    altText = altSchema.parse(fields.altText ? JSON.parse(fields.altText) : undefined) as Record<string, string> | undefined;
  } catch {
    throw badRequest("altText must be JSON like {\"tet\":\"...\",\"pt\":\"...\"}");
  }
  return created(await uploadMedia(auth, file, { altText, credit: fields.credit?.slice(0, 160) || undefined }, ctx));
});
