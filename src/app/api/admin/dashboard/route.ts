import { adminRoute, ok } from "@/lib/http";
import { can } from "@/lib/security/rbac";
import { dashboardStats, systemHealth } from "@/server/services/dashboard.service";

/** GET /api/admin/dashboard — executive analytics (+ system health for permitted roles). */
export const GET = adminRoute({ permission: "dashboard:read" }, async ({ auth }) => {
  const [stats, health] = await Promise.all([
    dashboardStats(auth),
    can(auth.user.role, "system:health") ? systemHealth() : Promise.resolve(undefined),
  ]);
  return ok({ ...stats, health });
});
