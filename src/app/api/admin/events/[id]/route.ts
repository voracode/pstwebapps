import { adminRoute, ok, paramStr, parseJson } from "@/lib/http";
import { eventUpdateSchema } from "@/lib/validation/content";
import { deleteEvent, getEventAdmin, updateEvent } from "@/server/services/event.service";

type P = { id: string };

export const GET = adminRoute<P>({ permission: "event:read" }, async ({ params, auth }) => ok(await getEventAdmin(auth, paramStr(params.id))));

export const PATCH = adminRoute<P>({ permission: "event:write" }, async ({ req, params, auth, ctx }) =>
  ok(await updateEvent(auth, paramStr(params.id), await parseJson(req, eventUpdateSchema), ctx)),
);

export const DELETE = adminRoute<P>({ permission: "event:write" }, async ({ params, auth, ctx }) => {
  await deleteEvent(auth, paramStr(params.id), ctx);
  return ok({ deleted: true });
});
