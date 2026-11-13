import { adminRoute, created, ok, pageMeta, paginate, paginationSchema, paramStr, parseJson, parseQuery } from "@/lib/http";
import { attendanceSchema } from "@/lib/validation/content";
import { listAttendance, recordAttendance } from "@/server/services/event.service";

type P = { id: string };

export const GET = adminRoute<P>({ permission: "event:read" }, async ({ req, params, auth }) => {
  const q = parseQuery(req, paginationSchema.extend({ pageSize: paginationSchema.shape.pageSize.default(50) }));
  const { skip, take } = paginate(q.page, q.pageSize);
  const { items, total, summary } = await listAttendance(auth, paramStr(params.id), skip, take);
  return ok({ items, summary, meta: pageMeta(total, q.page, q.pageSize) });
});

/** POST { qrToken } (scanned KTA) | { memberNumber } | { guestName, guestPhone?, guestGender? } */
export const POST = adminRoute<P>({ permission: "attendance:write" }, async ({ req, params, auth, ctx }) =>
  created(await recordAttendance(auth, paramStr(params.id), await parseJson(req, attendanceSchema), ctx)),
);
