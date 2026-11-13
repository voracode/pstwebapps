import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute, parseQuery } from "@/lib/http";
import { memberListSchema } from "@/lib/validation/member";
import { exportMembers } from "@/server/services/member-io.service";

const schema = memberListSchema.extend({ format: z.enum(["csv", "xlsx"]).default("xlsx") });

/**
 * GET /api/admin/members/export?format=xlsx|csv&<list filters>
 * Audited (WARNING) and announced to the security Telegram channel.
 * ID numbers are never exported.
 */
export const GET = adminRoute({ permission: "member:export" }, async ({ req, auth, ctx }) => {
  const { format, ...filter } = parseQuery(req, schema);
  const file = await exportMembers(auth, filter, format, ctx);
  return new NextResponse(new Uint8Array(file.body), {
    headers: {
      "content-type": file.contentType,
      "content-disposition": `attachment; filename="${file.filename}"`,
      "x-record-count": String(file.count),
    },
  });
});
