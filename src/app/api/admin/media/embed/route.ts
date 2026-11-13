import { z } from "zod";
import { adminRoute, created, parseJson } from "@/lib/http";
import { addVideoEmbed } from "@/server/services/content.service";

const schema = z.object({
  url: z.url().max(500),
  altText: z.record(z.enum(["tet", "pt", "id", "en"]), z.string().max(300)).optional(),
  credit: z.string().trim().max(160).optional(),
});

/** POST { url } — YouTube / Vimeo / Facebook video for galleries and articles. */
export const POST = adminRoute({ permission: "media:write" }, async ({ req, auth, ctx }) => {
  const { url, ...meta } = await parseJson(req, schema);
  return created(await addVideoEmbed(auth, url, meta as { altText?: Record<string, string>; credit?: string }, ctx));
});
