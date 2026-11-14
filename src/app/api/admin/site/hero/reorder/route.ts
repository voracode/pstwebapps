import { adminRoute, ok, parseJson } from "@/lib/http";
import { reorderSchema } from "@/lib/validation/site";
import { reorderHeroSlides } from "@/server/services/site.service";

/** POST /api/admin/site/hero/reorder — { ids: [...] } in display order */
export const POST = adminRoute({ permission: "post:write" }, async ({ req, auth, ctx }) =>
  ok(await reorderHeroSlides(auth, (await parseJson(req, reorderSchema)).ids, ctx)),
);
