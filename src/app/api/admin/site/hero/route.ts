import { adminRoute, created, ok, parseJson } from "@/lib/http";
import { heroCreateSchema } from "@/lib/validation/site";
import { createHeroSlide, listHeroSlides } from "@/server/services/site.service";

export const GET = adminRoute({ permission: "post:read" }, async () => ok(await listHeroSlides()));

/** POST /api/admin/site/hero — { imageId?, ctaHref?, sortOrder?, isActive?, startsAt?, endsAt?, translations[] } */
export const POST = adminRoute({ permission: "post:write" }, async ({ req, auth, ctx }) =>
  created(await createHeroSlide(auth, await parseJson(req, heroCreateSchema), ctx)),
);
