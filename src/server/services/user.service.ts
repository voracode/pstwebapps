import { db } from "@/lib/db";
import { audit, type AuditActor } from "@/lib/audit";
import { sendEmail } from "@/lib/notify";
import { mailConfigured } from "@/lib/notify/mailer";
import { ApiError, badRequest, conflict, forbidden, notFound } from "@/lib/http";
import type { RequestContext } from "@/lib/request";
import { hashPassword } from "@/lib/security/password";
import { randomToken } from "@/lib/security/crypto";
import { revokeAllSessions, type AuthSession } from "@/lib/security/session";
import { createPasswordResetToken, resetUrl } from "./auth.service";
import type { Role, UserStatus } from "@/generated/prisma/client";

const INVITE_TTL_HOURS = 48;

export const publicUserSelect = {
  id: true,
  email: true,
  name: true,
  phone: true,
  role: true,
  status: true,
  municipalityId: true,
  municipality: { select: { id: true, name: true, code: true } },
  preferredLocale: true,
  twoFactorEnabled: true,
  mustChangePassword: true,
  lockedUntil: true,
  lastLoginAt: true,
  lastLoginIp: true,
  telegramChatId: true,
  createdAt: true,
} as const;

const actorOf = (a: AuthSession): AuditActor => ({ id: a.user.id, email: a.user.email, role: a.user.role });

async function assertMunicipalityForRole(role: Role, municipalityId: number | null | undefined) {
  if (role === "MUNICIPAL_COORDINATOR") {
    if (!municipalityId) throw badRequest("A municipal coordinator must be assigned to a município");
    const exists = await db.municipality.count({ where: { id: municipalityId } });
    if (!exists) throw badRequest("Unknown município");
  }
}

/** Never leave the system without an active super admin. */
async function assertNotLastSuperAdmin(userId: string) {
  const others = await db.user.count({
    where: { role: "SUPER_ADMIN", status: "ACTIVE", deletedAt: null, id: { not: userId } },
  });
  if (others === 0) throw conflict("At least one active SUPER_ADMIN must remain");
}

export async function listUsers(filter: { role?: Role; status?: UserStatus; q?: string }, skip: number, take: number) {
  const where = {
    deletedAt: null,
    role: filter.role,
    status: filter.status,
    ...(filter.q
      ? { OR: [{ email: { contains: filter.q, mode: "insensitive" as const } }, { name: { contains: filter.q, mode: "insensitive" as const } }] }
      : {}),
  };
  const [items, total] = await Promise.all([
    db.user.findMany({ where, select: publicUserSelect, orderBy: { createdAt: "desc" }, skip, take }),
    db.user.count({ where }),
  ]);
  return { items, total };
}

export async function createUser(
  auth: AuthSession,
  input: { email: string; name: string; role: Role; municipalityId?: number; phone?: string; telegramChatId?: string },
  ctx: RequestContext,
) {
  await assertMunicipalityForRole(input.role, input.municipalityId);
  if (await db.user.findUnique({ where: { email: input.email } })) throw conflict("E-mail already in use");

  // Unknown random password — the user sets their own through the invite link.
  const user = await db.user.create({
    data: {
      email: input.email,
      name: input.name,
      role: input.role,
      phone: input.phone,
      telegramChatId: input.telegramChatId,
      municipalityId: input.role === "MUNICIPAL_COORDINATOR" ? input.municipalityId : null,
      passwordHash: await hashPassword(randomToken(24)),
      mustChangePassword: true,
    },
    select: publicUserSelect,
  });

  const token = await createPasswordResetToken(user.id, INVITE_TTL_HOURS * 60, ctx.ip);
  const url = resetUrl(token);
  await sendEmail(user.email, "user.invite", { name: user.name, role: user.role, resetUrl: url, expiresHours: INVITE_TTL_HOURS });
  await audit({
    action: "user.created",
    severity: input.role === "SUPER_ADMIN" ? "CRITICAL" : "INFO",
    actor: actorOf(auth),
    entityType: "User",
    entityId: user.id,
    metadata: { email: user.email, role: user.role, municipalityId: user.municipalityId },
    ctx,
  });

  // Without SMTP the super admin must hand the link over personally.
  return { user, inviteUrl: mailConfigured() ? undefined : url };
}

export async function updateUser(
  auth: AuthSession,
  id: string,
  input: {
    name?: string;
    role?: Role;
    municipalityId?: number | null;
    phone?: string | null;
    status?: UserStatus;
    telegramChatId?: string | null;
  },
  ctx: RequestContext,
) {
  const existing = await db.user.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw notFound("User");

  const nextRole = input.role ?? existing.role;
  const nextMunicipality = input.municipalityId !== undefined ? input.municipalityId : existing.municipalityId;
  await assertMunicipalityForRole(nextRole, nextMunicipality);

  const demoting = existing.role === "SUPER_ADMIN" && (nextRole !== "SUPER_ADMIN" || input.status === "DISABLED");
  if (demoting) {
    if (id === auth.user.id) throw forbidden("You cannot demote or disable your own account");
    await assertNotLastSuperAdmin(id);
  }

  const user = await db.user.update({
    where: { id },
    data: {
      name: input.name,
      role: input.role,
      phone: input.phone,
      status: input.status,
      telegramChatId: input.telegramChatId,
      municipalityId: nextRole === "MUNICIPAL_COORDINATOR" ? nextMunicipality : null,
    },
    select: publicUserSelect,
  });

  const privilegeChanged = input.role !== undefined && input.role !== existing.role;
  if (privilegeChanged || input.status === "DISABLED" || (input.municipalityId !== undefined && input.municipalityId !== existing.municipalityId)) {
    await revokeAllSessions(id);
  }

  await audit({
    action: privilegeChanged ? "user.role_changed" : input.status && input.status !== existing.status ? "user.status_changed" : "user.updated",
    severity: privilegeChanged && (nextRole === "SUPER_ADMIN" || existing.role === "SUPER_ADMIN") ? "CRITICAL" : privilegeChanged ? "WARNING" : "INFO",
    actor: actorOf(auth),
    entityType: "User",
    entityId: id,
    metadata: {
      changed: Object.keys(input).filter((k) => input[k as keyof typeof input] !== undefined),
      fromRole: privilegeChanged ? existing.role : undefined,
      toRole: privilegeChanged ? nextRole : undefined,
      status: input.status,
    },
    ctx,
  });
  return user;
}

export async function adminResetPassword(auth: AuthSession, id: string, ctx: RequestContext) {
  const user = await db.user.findFirst({ where: { id, deletedAt: null } });
  if (!user) throw notFound("User");
  await db.user.update({ where: { id }, data: { mustChangePassword: true } });
  await revokeAllSessions(id);
  const token = await createPasswordResetToken(id, INVITE_TTL_HOURS * 60, ctx.ip);
  const url = resetUrl(token);
  await sendEmail(user.email, "auth.password_reset", { name: user.name, resetUrl: url, expiresMinutes: INVITE_TTL_HOURS * 60 });
  await audit({ action: "user.password_reset_by_admin", severity: "WARNING", actor: actorOf(auth), entityType: "User", entityId: id, ctx });
  return { resetUrl: mailConfigured() ? undefined : url };
}

export async function adminResetTwoFactor(auth: AuthSession, id: string, ctx: RequestContext) {
  if (id === auth.user.id) throw forbidden("Use your own security settings to change your 2FA");
  const user = await db.user.findFirst({ where: { id, deletedAt: null } });
  if (!user) throw notFound("User");
  await db.$transaction([
    db.user.update({ where: { id }, data: { twoFactorEnabled: false, twoFactorSecretEnc: null, twoFactorEnabledAt: null } }),
    db.userRecoveryCode.deleteMany({ where: { userId: id } }),
  ]);
  await revokeAllSessions(id);
  await audit({ action: "user.2fa_reset_by_admin", severity: "CRITICAL", actor: actorOf(auth), entityType: "User", entityId: id, ctx });
}

export async function unlockUser(auth: AuthSession, id: string, ctx: RequestContext) {
  const { count } = await db.user.updateMany({ where: { id, deletedAt: null }, data: { lockedUntil: null, failedLoginCount: 0 } });
  if (!count) throw notFound("User");
  await audit({ action: "user.unlocked", actor: actorOf(auth), entityType: "User", entityId: id, ctx });
}

/** Soft delete: account disabled, e-mail freed for re-use, sessions revoked. */
export async function deleteUser(auth: AuthSession, id: string, ctx: RequestContext) {
  if (id === auth.user.id) throw forbidden("You cannot delete your own account");
  const user = await db.user.findFirst({ where: { id, deletedAt: null } });
  if (!user) throw notFound("User");
  if (user.role === "SUPER_ADMIN") await assertNotLastSuperAdmin(id);

  await db.user.update({
    where: { id },
    data: { status: "DISABLED", deletedAt: new Date(), email: `deleted+${id}@invalid.local` },
  });
  await revokeAllSessions(id);
  await audit({
    action: "user.deleted",
    severity: "WARNING",
    actor: actorOf(auth),
    entityType: "User",
    entityId: id,
    metadata: { email: user.email, role: user.role },
    ctx,
  });
}

export function assertCanManageUsers(auth: AuthSession) {
  if (auth.user.role !== "SUPER_ADMIN") throw new ApiError(403, "FORBIDDEN", "Only SUPER_ADMIN can manage users");
}
