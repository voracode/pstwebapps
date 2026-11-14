import { adminRoute, ok, paramStr, parseJson } from "@/lib/http";
import { heroUpdateSchema } from "@/lib/validation/site";
import { deleteHeroSlide, updateHeroSlide } from "@/server/services/site.service";

type P = { id: string };

export const PATCH = adminRoute<P>({ permission: "post:write" }, async ({ req, params, auth, ctx }) =>
  ok(await updateHeroSlide(auth, paramStr(params.id), await parseJson(req, heroUpdateSchema), ctx)),
);

export const DELETE = adminRoute<P>({ permission: "post:write" }, async ({ params, auth, ctx }) => {
  await deleteHeroSlide(auth, paramStr(params.id), ctx);
  return ok({ deleted: true });
});
