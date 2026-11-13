import { adminRoute, badRequest, formFile, ok, paramStr, parseForm } from "@/lib/http";
import { replaceMemberPhoto } from "@/server/services/member.service";

type P = { id: string };

/** POST multipart `photo` — replace the member's photo (used on the KTA card). */
export const POST = adminRoute<P>({ permission: "member:update" }, async ({ req, params, auth, ctx }) => {
  const photo = formFile(await parseForm(req), "photo");
  if (!photo) throw badRequest("photo is required");
  return ok(await replaceMemberPhoto(auth, paramStr(params.id), photo, ctx));
});
