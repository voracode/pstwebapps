import { z } from "zod";
import { adminRoute, ok, paramStr, parseJson } from "@/lib/http";
import { markContactMessage } from "@/server/services/aspiration.service";

type P = { id: string };

const schema = z.object({ read: z.boolean().optional(), spam: z.boolean().optional() });

export const PATCH = adminRoute<P>({ permission: "contact:read" }, async ({ req, params, auth, ctx }) =>
  ok(await markContactMessage(auth, paramStr(params.id), await parseJson(req, schema), ctx)),
);
