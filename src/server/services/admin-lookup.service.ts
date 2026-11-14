import { db } from "@/lib/db";
import { can, isMunicipalScoped, scopeFilter } from "@/lib/security/rbac";
import type { AuthSession } from "@/lib/security/session";
import { signedUrl } from "@/lib/storage";
import type { Role } from "@/generated/prisma/client";

/**
 * Small read-only queries used by backoffice screens (SIM-PST, events,
 * aspirations). Everything here respects the coordinator's município scope.
 */

/** Signed URL of the PNG of the member's active (non-revoked) KTA card, if any. */
export async function activeCardPreviewUrl(auth: AuthSession, memberId: string): Promise<string | null> {
  const card = await db.membershipCard.findFirst({
    where: { memberId, revokedAt: null, member: { deletedAt: null, ...scopeFilter(auth.user) } },
    orderBy: { version: "desc" },
    select: { pngKey: true },
  });
  return card?.pngKey ? signedUrl(card.pngKey, 600) : null;
}

/** Member counts per status inside the user's scope (status tabs). */
export async function memberStatusCounts(auth: AuthSession): Promise<Record<string, number>> {
  const rows = await db.member.groupBy({
    by: ["status"],
    where: { deletedAt: null, ...scopeFilter(auth.user) },
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
}

/**
 * Users who can be assigned an aspiration: active accounts whose role has
 * `aspiration:manage`. Coordinators only see colleagues from their município.
 */
export async function assignableUsers(auth: AuthSession) {
  const roles = (["SUPER_ADMIN", "NATIONAL_SECRETARY", "MUNICIPAL_COORDINATOR", "MEDIA_EDITOR", "AUDITOR"] as Role[]).filter((r) =>
    can(r, "aspiration:manage"),
  );
  return db.user.findMany({
    where: {
      status: "ACTIVE",
      deletedAt: null,
      role: { in: roles },
      ...(isMunicipalScoped(auth.user) ? { municipalityId: auth.user.municipalityId ?? -1 } : {}),
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true, municipality: { select: { name: true } } },
  });
}

/** Administrative post of a suco (to pre-fill cascading geo selects). */
export async function adminPostOfSuco(sucoId: number | null | undefined): Promise<number | undefined> {
  if (!sucoId) return undefined;
  const s = await db.suco.findUnique({ where: { id: sucoId }, select: { adminPostId: true } });
  return s?.adminPostId ?? undefined;
}

/** Name of a município (filter chips, scope labels). */
export async function municipalityName(id: number | null | undefined): Promise<string | null> {
  if (!id) return null;
  const m = await db.municipality.findUnique({ where: { id }, select: { name: true } });
  return m?.name ?? null;
}

/** All municipalities, ordered (filters). */
export function municipalityOptions() {
  return db.municipality.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });
}

/** Unread / spam counters for the contact inbox tabs. */
export async function contactCounts() {
  const [unread, spam] = await Promise.all([
    db.contactMessage.count({ where: { isSpam: false, readAt: null } }),
    db.contactMessage.count({ where: { isSpam: true } }),
  ]);
  return { unread, spam };
}
