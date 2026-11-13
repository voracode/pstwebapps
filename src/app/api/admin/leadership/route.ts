import { z } from "zod";
import { adminRoute, created, ok, parseJson, parseQuery } from "@/lib/http";
import { optionalInt } from "@/lib/validation/common";
import { LEADERSHIP_LEVELS, leadershipCreateSchema } from "@/lib/validation/content";
import { createLeadership, listLeadership } from "@/server/services/content.service";

const listSchema = z.object({ level: z.enum(LEADERSHIP_LEVELS).optional(), municipalityId: optionalInt });

export const GET = adminRoute({ permission: "post:read" }, async ({ req }) => ok(await listLeadership(parseQuery(req, listSchema))));

export const POST = adminRoute({ permission: "leadership:write" }, async ({ req, auth, ctx }) =>
  created(await createLeadership(auth, await parseJson(req, leadershipCreateSchema), ctx)),
);
