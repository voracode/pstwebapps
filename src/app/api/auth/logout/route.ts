import { adminRoute, ok } from "@/lib/http";
import { logout } from "@/server/services/auth.service";

export const POST = adminRoute(
  { stages: ["ACTIVE", "TWO_FACTOR_REQUIRED", "PASSWORD_CHANGE_REQUIRED", "TWO_FACTOR_SETUP_REQUIRED"] },
  async ({ auth, ctx }) => {
    await logout(auth, ctx);
    return ok({ loggedOut: true });
  },
);
