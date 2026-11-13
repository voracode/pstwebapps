import { NextResponse } from "next/server";
import { adminRoute, badRequest, formFields, formFile, ok, parseForm } from "@/lib/http";
import { booleanish } from "@/lib/validation/common";
import { assertImportScope, importMembers, importTemplateCsv } from "@/server/services/member-io.service";

/** GET /api/admin/members/import — downloads the CSV template. */
export const GET = adminRoute({ permission: "member:import" }, async () =>
  new NextResponse(importTemplateCsv(), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="pst-import-template.csv"',
    },
  }),
);

/**
 * POST multipart: `file` (.csv or .xlsx), `dryRun` ("true" to validate only).
 * Run with dryRun first, show the row errors, then import for real.
 */
export const POST = adminRoute({ permission: "member:import" }, async ({ req, auth, ctx }) => {
  assertImportScope(auth);
  const form = await parseForm(req);
  const file = formFile(form, "file");
  if (!file) throw badRequest("file is required");
  const dryRun = booleanish.parse(formFields(form).dryRun);
  return ok(await importMembers(auth, file, { dryRun }, ctx));
});
