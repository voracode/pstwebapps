import { adminRoute, ok, parseJson } from "@/lib/http";
import { reorderSchema } from "@/lib/validation/site";
import { reorderSections } from "@/server/services/site.service";

/** POST /api/admin/site/sections/reorder — { ids: [...] } (all from one page, in display order) */
export const POST = adminRoute({ permission: "post:write" }, async ({ req, auth, ctx }) =>
  ok(await reorderSections(auth, (await parseJson(req, reorderSchema)).ids, ctx)),
);
