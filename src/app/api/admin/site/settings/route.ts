import { adminRoute, ok, parseJson } from "@/lib/http";
import { settingsUpdateSchema } from "@/lib/validation/site";
import { listEditableSettings, updateSettings } from "@/server/services/site.service";

/** GET /api/admin/site/settings — editable settings with their current values. */
export const GET = adminRoute({ permission: "settings:write" }, async () => ok(await listEditableSettings()));

/** PATCH /api/admin/site/settings — { values: { "site.motto": "...", "kta.validityYears": 5, ... } } */
export const PATCH = adminRoute({ permission: "settings:write" }, async ({ req, auth, ctx }) =>
  ok(await updateSettings(auth, (await parseJson(req, settingsUpdateSchema)).values, ctx)),
);
