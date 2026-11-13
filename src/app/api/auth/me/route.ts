import { adminRoute, ok } from "@/lib/http";
import { permissionsFor } from "@/lib/security/rbac";

/** GET /api/auth/me — current user, login stage and effective permissions. */
export const GET = adminRoute(
  { stages: ["ACTIVE", "TWO_FACTOR_REQUIRED", "PASSWORD_CHANGE_REQUIRED", "TWO_FACTOR_SETUP_REQUIRED"] },
  async ({ auth }) => {
    const { user, stage, session } = auth;
    return ok({
      stage,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        municipalityId: user.municipalityId,
        preferredLocale: user.preferredLocale,
        twoFactorEnabled: user.twoFactorEnabled,
      },
      permissions: stage === "ACTIVE" ? permissionsFor(user.role) : [],
      sessionExpiresAt: session.expiresAt,
    });
  },
);
