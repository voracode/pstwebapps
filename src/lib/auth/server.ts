import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { can, permissionsFor, type Permission } from "@/lib/security/rbac";
import { getSession, type AuthSession } from "@/lib/security/session";

/**
 * Server-component guard for backoffice pages.
 *
 *   const auth = await requireAdmin("member:read");
 *   const { items } = await listMembers(auth, filters, skip, take);
 *
 * - no session            → /<locale>/admin/login?next=…
 * - login step unfinished → /<locale>/admin/login (the page resumes the step)
 * - missing permission    → 404 (don't reveal that the page exists)
 */
export async function requireAdmin(permission?: Permission, nextPath?: string): Promise<AuthSession> {
  const locale = await getLocale();
  const auth = await getSession();
  if (!auth || auth.stage !== "ACTIVE") {
    const q = nextPath ? `?next=${encodeURIComponent(nextPath)}` : "";
    redirect({ href: `/admin/login${q}`, locale });
  }
  const session = auth as AuthSession;
  if (permission && !can(session.user.role, permission)) notFound();
  return session;
}

/** Serialisable snapshot of the user for client components (nav, menus). */
export function clientUser(auth: AuthSession) {
  return {
    id: auth.user.id,
    name: auth.user.name,
    email: auth.user.email,
    role: auth.user.role,
    municipalityId: auth.user.municipalityId,
    twoFactorEnabled: auth.user.twoFactorEnabled,
    permissions: permissionsFor(auth.user.role),
    sessionExpiresAt: auth.session.expiresAt.toISOString(),
  };
}

export type ClientUser = ReturnType<typeof clientUser>;
