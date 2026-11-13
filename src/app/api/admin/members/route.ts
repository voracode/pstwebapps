import {
  adminRoute,
  created,
  formFields,
  formFile,
  ok,
  pageMeta,
  paginate,
  paginationSchema,
  parseForm,
  parseQuery,
} from "@/lib/http";
import { adminCreateMemberSchema, memberListSchema } from "@/lib/validation/member";
import { createMemberByAdmin, listMembers } from "@/server/services/member.service";

const listSchema = memberListSchema.extend(paginationSchema.shape);

/** GET /api/admin/members — filtered, paginated, scoped to the coordinator's município. */
export const GET = adminRoute({ permission: "member:read" }, async ({ req, auth }) => {
  const q = parseQuery(req, listSchema);
  const { skip, take } = paginate(q.page, q.pageSize);
  const { items, total } = await listMembers(auth, q, skip, take);
  return ok({ items, meta: pageMeta(total, q.page, q.pageSize) });
});

/** POST /api/admin/members — multipart: member fields + optional `photo`, `idScan`. */
export const POST = adminRoute({ permission: "member:create" }, async ({ req, auth, ctx }) => {
  const form = await parseForm(req);
  const input = adminCreateMemberSchema.parse(formFields(form));
  const member = await createMemberByAdmin(auth, input, { photo: formFile(form, "photo"), idScan: formFile(form, "idScan") }, ctx);
  return created(member);
});
