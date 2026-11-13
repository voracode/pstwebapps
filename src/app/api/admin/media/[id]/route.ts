import { z } from "zod";
import { adminRoute, ok, paramStr, parseJson } from "@/lib/http";
import { deleteMedia, updateMedia } from "@/server/services/content.service";

type P = { id: string };

const patchSchema = z.object({
  altText: z.record(z.enum(["tet", "pt", "id", "en"]), z.string().max(300)).optional(),
  credit: z.string().trim().max(160).nullable().optional(),
});

export const PATCH = adminRoute<P>({ permission: "media:write" }, async ({ req, params, auth, ctx }) => {
  const input = await parseJson(req, patchSchema);
  return ok(await updateMedia(auth, paramStr(params.id), input as { altText?: Record<string, string>; credit?: string | null }, ctx));
});

export const DELETE = adminRoute<P>({ permission: "media:write" }, async ({ params, auth, ctx }) => {
  await deleteMedia(auth, paramStr(params.id), ctx);
  return ok({ deleted: true });
});
