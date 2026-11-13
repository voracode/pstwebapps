import { z } from "zod";
import { adminRoute, created, paramStr, parseJson } from "@/lib/http";
import { addAspirationNote } from "@/server/services/aspiration.service";

type P = { id: string };

const schema = z.object({
  body: z.string().trim().min(2).max(5000),
  /** true = reply visible to the citizen on the tracking page (and e-mailed). */
  isPublic: z.boolean().default(false),
});

export const POST = adminRoute<P>({ permission: "aspiration:manage" }, async ({ req, params, auth, ctx }) => {
  const { body, isPublic } = await parseJson(req, schema);
  return created(await addAspirationNote(auth, paramStr(params.id), body, isPublic, ctx));
});
