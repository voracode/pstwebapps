import { z } from "zod";
import { adminRoute, ok, paramStr, parseJson } from "@/lib/http";
import { TICKET_PRIORITIES, TICKET_STATUSES } from "@/lib/validation/content";
import { getAspiration, updateAspiration } from "@/server/services/aspiration.service";

type P = { id: string };

export const GET = adminRoute<P>({ permission: "aspiration:read" }, async ({ params, auth }) => ok(await getAspiration(auth, paramStr(params.id))));

const patchSchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  assignedToId: z.string().cuid().nullable().optional(),
  municipalityId: z.number().int().positive().nullable().optional(),
});

export const PATCH = adminRoute<P>({ permission: "aspiration:manage" }, async ({ req, params, auth, ctx }) =>
  ok(await updateAspiration(auth, paramStr(params.id), await parseJson(req, patchSchema), ctx)),
);
