import { adminRoute, created, ok, parseJson, parseQuery } from "@/lib/http";
import { sectionCreateSchema, sectionListSchema } from "@/lib/validation/site";
import { createSection, listSections } from "@/server/services/site.service";

/** GET /api/admin/site/sections?page=ABOUT|HISTORY|IDEOLOGY|PROGRAM */
export const GET = adminRoute({ permission: "post:read" }, async ({ req }) => ok(await listSections(parseQuery(req, sectionListSchema).page)));

/** POST /api/admin/site/sections — { page, icon?, sortOrder?, isVisible, translations[] } */
export const POST = adminRoute({ permission: "post:write" }, async ({ req, auth, ctx }) =>
  created(await createSection(auth, await parseJson(req, sectionCreateSchema), ctx)),
);
