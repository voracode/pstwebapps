import { audit, verifyAuditChain } from "@/lib/audit";
import { adminRoute, ok } from "@/lib/http";

/** GET /api/admin/audit/verify — recomputes the hash chain; any tampering is reported. */
export const GET = adminRoute({ permission: "audit:read" }, async ({ auth, ctx }) => {
  const result = await verifyAuditChain();
  await audit({
    action: result.ok ? "audit.verified" : "audit.chain_broken",
    severity: result.ok ? "INFO" : "CRITICAL",
    actor: { id: auth.user.id, email: auth.user.email, role: auth.user.role },
    metadata: { ...result },
    ctx,
  });
  return ok(result);
});
