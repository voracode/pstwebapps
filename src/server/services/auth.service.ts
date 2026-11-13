import QRCode from "qrcode";
import { db } from "@/lib/db";
import { env } from "@/env";
import { redis } from "@/lib/redis";
import { audit, type AuditActor } from "@/lib/audit";
import { alertAdmins, alertUser, sendEmail } from "@/lib/notify";
import { ApiError, badRequest, conflict, forbidden, tooMany, unauthorized } from "@/lib/http";
import type { RequestContext } from "@/lib/request";
import { decrypt, encrypt, randomToken, sha256Hex } from "@/lib/security/crypto";
import { hashPassword, needsRehash, verifyPassword } from "@/lib/security/password";
import { checkPasswordPolicy } from "@/lib/security/password-policy";
import { rateLimit, resetRateLimit } from "@/lib/security/rate-limit";
import {
  computeStage,
  createSession,
  revokeAllSessions,
  revokeSession,
  rotateSession,
  clearSessionCookie,
  type AuthSession,
  type SessionStage,
} from "@/lib/security/session";
import {
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  totpUri,
  verifyTotp,
} from "@/lib/security/totp";

const INVALID_CREDENTIALS = () => new ApiError(401, "INVALID_CREDENTIALS", "Invalid e-mail or password");
const LOCKED = (until: Date) =>
  new ApiError(423, "ACCOUNT_LOCKED", "Account temporarily locked after repeated failed attempts", {
    lockedUntil: until.toISOString(),
  });

const actorOf = (u: { id: string; email: string; role: AuditActor["role"] }): AuditActor => ({
  id: u.id,
  email: u.email,
  role: u.role,
});

/** Hash compared against when the e-mail is unknown, so timing doesn't leak which accounts exist. */
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword(randomToken(16)));

const totpAad = (userId: string) => `totp:${userId}`;

// -----------------------------------------------------------------------------
// Failed-attempt accounting shared by password and 2FA steps
// -----------------------------------------------------------------------------
async function registerFailure(
  user: { id: string; email: string; role: AuditActor["role"]; telegramChatId: string | null },
  ctx: RequestContext,
  step: "password" | "2fa",
): Promise<Date | null> {
  const e = env();
  const updated = await db.user.update({
    where: { id: user.id },
    data: { failedLoginCount: { increment: 1 } },
    select: { failedLoginCount: true },
  });

  await audit({
    action: step === "password" ? "auth.login.failed" : "auth.2fa.failed",
    severity: "WARNING",
    actor: actorOf(user),
    entityType: "User",
    entityId: user.id,
    metadata: { attempt: updated.failedLoginCount },
    ctx,
  });

  if (updated.failedLoginCount < e.LOGIN_MAX_ATTEMPTS) return null;

  const until = new Date(Date.now() + e.LOGIN_LOCKOUT_MINUTES * 60_000);
  await db.user.update({ where: { id: user.id }, data: { lockedUntil: until, failedLoginCount: 0 } });
  await revokeAllSessions(user.id);

  const payload = {
    email: user.email,
    ip: ctx.ip,
    attempts: updated.failedLoginCount,
    until: until.toISOString(),
  };
  await audit({
    action: "user.locked",
    severity: "WARNING",
    actor: actorOf(user),
    entityType: "User",
    entityId: user.id,
    metadata: { step, attempts: updated.failedLoginCount, until: until.toISOString() },
    ctx,
  });
  await alertAdmins("security", "security.lockout", payload);
  await alertUser(user.telegramChatId, "security.lockout", payload);
  await sendEmail(user.email, "security.lockout", payload);
  return until;
}

// -----------------------------------------------------------------------------
// Login
// -----------------------------------------------------------------------------
export async function login(emailRaw: string, password: string, ctx: RequestContext): Promise<{ stage: SessionStage }> {
  const e = env();
  const email = emailRaw.trim().toLowerCase();

  const ipKey = ctx.ip ?? "unknown";
  const byIp = await rateLimit("login-ip", ipKey, { limit: e.LOGIN_IP_MAX_ATTEMPTS_PER_HOUR, windowSec: 3600, failClosed: true });
  if (!byIp.allowed) {
    await audit({ action: "auth.login.rate_limited", severity: "WARNING", actorEmail: email, metadata: { scope: "ip" }, ctx });
    throw tooMany(byIp.retryAfterSec);
  }
  // Slows distributed guessing against a single account from many IPs.
  const byEmail = await rateLimit("login-email", sha256Hex(email), { limit: 20, windowSec: 900, failClosed: true });
  if (!byEmail.allowed) throw tooMany(byEmail.retryAfterSec);

  const user = await db.user.findFirst({ where: { email, deletedAt: null } });

  if (!user) {
    await verifyPassword(await getDummyHash(), password);
    await audit({ action: "auth.login.failed", severity: "WARNING", actorEmail: email, metadata: { reason: "unknown_user" }, ctx });
    throw INVALID_CREDENTIALS();
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await audit({ action: "auth.login.blocked", severity: "WARNING", actor: actorOf(user), entityType: "User", entityId: user.id, metadata: { reason: "locked" }, ctx });
    throw LOCKED(user.lockedUntil);
  }

  const valid = await verifyPassword(user.passwordHash, password);

  if (!valid) {
    const lockedUntil = await registerFailure(user, ctx, "password");
    if (lockedUntil) throw LOCKED(lockedUntil);
    throw INVALID_CREDENTIALS();
  }

  if (user.status !== "ACTIVE") {
    await audit({ action: "auth.login.blocked", severity: "WARNING", actor: actorOf(user), entityType: "User", entityId: user.id, metadata: { reason: "disabled" }, ctx });
    throw INVALID_CREDENTIALS();
  }

  const isNewIp = !!ctx.ip && !!user.lastLoginIp && user.lastLoginIp !== ctx.ip;
  await db.user.update({
    where: { id: user.id },
    data: {
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      lastLoginIp: ctx.ip,
      ...(needsRehash(user.passwordHash) ? { passwordHash: await hashPassword(password) } : {}),
    },
  });
  await resetRateLimit("login-email", sha256Hex(email));
  await createSession(user.id, ctx, { twoFactorVerified: false });

  const stage = computeStage(user, false);
  await audit({
    action: "auth.login.success",
    actor: actorOf(user),
    entityType: "User",
    entityId: user.id,
    metadata: { stage, newIp: isNewIp || undefined },
    ctx,
  });
  if (isNewIp && user.role === "SUPER_ADMIN") {
    await alertAdmins("security", "security.alert", {
      action: "auth.login.new_ip",
      actorEmail: user.email,
      ip: ctx.ip,
      details: `previous IP ${user.lastLoginIp}`,
    });
  }
  return { stage };
}

export async function logout(auth: AuthSession, ctx: RequestContext) {
  await revokeSession(auth.session.id);
  await clearSessionCookie();
  await audit({ action: "auth.logout", actor: actorOf(auth.user), entityType: "User", entityId: auth.user.id, ctx });
}

// -----------------------------------------------------------------------------
// Second factor
// -----------------------------------------------------------------------------
export async function verifySecondFactor(
  auth: AuthSession,
  input: { code?: string; recoveryCode?: string },
  ctx: RequestContext,
): Promise<{ stage: SessionStage }> {
  const rl = await rateLimit("2fa", auth.session.id, { limit: 5, windowSec: 900, failClosed: true });
  if (!rl.allowed) throw tooMany(rl.retryAfterSec);

  const user = await db.user.findUniqueOrThrow({ where: { id: auth.user.id } });
  if (!user.twoFactorEnabled || !user.twoFactorSecretEnc) throw badRequest("Two-factor authentication is not enabled");

  let okFactor = false;
  let method: "totp" | "recovery" = "totp";

  if (input.code) {
    const secret = decrypt(user.twoFactorSecretEnc, totpAad(user.id));
    okFactor = await verifyTotp(user.id, secret, input.code);
  } else if (input.recoveryCode) {
    method = "recovery";
    const hit = await db.userRecoveryCode.findFirst({
      where: { userId: user.id, usedAt: null, codeHash: hashRecoveryCode(input.recoveryCode) },
    });
    if (hit) {
      // Conditional update: two concurrent requests can't both consume the same code.
      const { count } = await db.userRecoveryCode.updateMany({
        where: { id: hit.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      okFactor = count === 1;
    }
  }

  if (!okFactor) {
    const lockedUntil = await registerFailure(user, ctx, "2fa");
    if (lockedUntil) {
      await clearSessionCookie();
      throw LOCKED(lockedUntil);
    }
    throw new ApiError(401, "INVALID_2FA_CODE", "Invalid verification code");
  }

  await db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0 } });
  await rotateSession(auth.session.id, user.id, ctx, { twoFactorVerified: true });

  const remaining =
    method === "recovery" ? await db.userRecoveryCode.count({ where: { userId: user.id, usedAt: null } }) : undefined;
  await audit({
    action: "auth.2fa.success",
    severity: method === "recovery" ? "WARNING" : "INFO",
    actor: actorOf(user),
    entityType: "User",
    entityId: user.id,
    metadata: { method, recoveryCodesRemaining: remaining },
    ctx,
  });
  return { stage: computeStage(user, true) };
}

const PENDING_2FA_KEY = (userId: string) => `2fa:pending:${userId}`;

export async function startTwoFactorSetup(auth: AuthSession) {
  if (auth.user.twoFactorEnabled) throw conflict("Two-factor authentication is already enabled");
  const secret = generateTotpSecret();
  await redis().set(PENDING_2FA_KEY(auth.user.id), encrypt(secret, totpAad(auth.user.id)), "EX", 600);
  const uri = totpUri(secret, auth.user.email);
  return {
    secret,
    otpauthUri: uri,
    qrDataUrl: await QRCode.toDataURL(uri, { errorCorrectionLevel: "M", margin: 1, width: 240 }),
    expiresInSec: 600,
  };
}

export async function confirmTwoFactorSetup(auth: AuthSession, code: string, ctx: RequestContext) {
  if (auth.user.twoFactorEnabled) throw conflict("Two-factor authentication is already enabled");
  const pending = await redis().get(PENDING_2FA_KEY(auth.user.id));
  if (!pending) throw badRequest("Setup expired — start again");

  const secret = decrypt(pending, totpAad(auth.user.id));
  if (!(await verifyTotp(auth.user.id, secret, code))) {
    throw new ApiError(401, "INVALID_2FA_CODE", "Invalid verification code");
  }

  const codes = generateRecoveryCodes();
  await db.$transaction([
    db.user.update({
      where: { id: auth.user.id },
      data: {
        twoFactorEnabled: true,
        twoFactorSecretEnc: encrypt(secret, totpAad(auth.user.id)),
        twoFactorEnabledAt: new Date(),
      },
    }),
    db.userRecoveryCode.deleteMany({ where: { userId: auth.user.id } }),
    db.userRecoveryCode.createMany({
      data: codes.map((c) => ({ userId: auth.user.id, codeHash: hashRecoveryCode(c) })),
    }),
  ]);
  await redis().del(PENDING_2FA_KEY(auth.user.id));
  await rotateSession(auth.session.id, auth.user.id, ctx, { twoFactorVerified: true });
  await audit({ action: "auth.2fa.enabled", actor: actorOf(auth.user), entityType: "User", entityId: auth.user.id, ctx });

  const user = await db.user.findUniqueOrThrow({ where: { id: auth.user.id } });
  return { recoveryCodes: codes, stage: computeStage(user, true) };
}

export async function regenerateRecoveryCodes(auth: AuthSession, code: string, ctx: RequestContext) {
  const user = await db.user.findUniqueOrThrow({ where: { id: auth.user.id } });
  if (!user.twoFactorEnabled || !user.twoFactorSecretEnc) throw badRequest("Two-factor authentication is not enabled");
  if (!(await verifyTotp(user.id, decrypt(user.twoFactorSecretEnc, totpAad(user.id)), code))) {
    throw new ApiError(401, "INVALID_2FA_CODE", "Invalid verification code");
  }
  const codes = generateRecoveryCodes();
  await db.$transaction([
    db.userRecoveryCode.deleteMany({ where: { userId: user.id } }),
    db.userRecoveryCode.createMany({ data: codes.map((c) => ({ userId: user.id, codeHash: hashRecoveryCode(c) })) }),
  ]);
  await audit({ action: "auth.2fa.recovery_regenerated", actor: actorOf(user), entityType: "User", entityId: user.id, ctx });
  return { recoveryCodes: codes };
}

export async function disableTwoFactor(auth: AuthSession, password: string, code: string, ctx: RequestContext) {
  if (env().TWO_FACTOR_REQUIRED_ROLES.includes(auth.user.role)) {
    throw forbidden("Two-factor authentication is mandatory for your role");
  }
  const user = await db.user.findUniqueOrThrow({ where: { id: auth.user.id } });
  if (!user.twoFactorEnabled || !user.twoFactorSecretEnc) throw badRequest("Two-factor authentication is not enabled");
  const passOk = await verifyPassword(user.passwordHash, password);
  const codeOk = passOk && (await verifyTotp(user.id, decrypt(user.twoFactorSecretEnc, totpAad(user.id)), code));
  if (!codeOk) throw unauthorized("Invalid password or verification code");

  await db.$transaction([
    db.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: false, twoFactorSecretEnc: null, twoFactorEnabledAt: null },
    }),
    db.userRecoveryCode.deleteMany({ where: { userId: user.id } }),
  ]);
  await audit({ action: "auth.2fa.disabled", severity: "WARNING", actor: actorOf(user), entityType: "User", entityId: user.id, ctx });
}

// -----------------------------------------------------------------------------
// Passwords
// -----------------------------------------------------------------------------
async function assertNewPasswordAcceptable(userId: string, email: string, name: string, next: string) {
  const errors = checkPasswordPolicy(next, { email, name });
  if (errors.length) throw new ApiError(422, "WEAK_PASSWORD", "Password does not meet the policy", errors);

  const depth = env().PASSWORD_HISTORY_DEPTH;
  const current = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
  const history = depth
    ? await db.passwordHistory.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: depth })
    : [];
  for (const h of [current.passwordHash, ...history.map((x) => x.passwordHash)]) {
    if (await verifyPassword(h, next)) {
      throw new ApiError(422, "PASSWORD_REUSED", `Password must differ from your last ${depth + 1} passwords`);
    }
  }
}

async function storeNewPassword(userId: string, next: string) {
  const depth = env().PASSWORD_HISTORY_DEPTH;
  const old = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
  const newHash = await hashPassword(next);

  await db.$transaction(async (tx) => {
    await tx.passwordHistory.create({ data: { userId, passwordHash: old.passwordHash } });
    const stale = await tx.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: depth,
      select: { id: true },
    });
    if (stale.length) await tx.passwordHistory.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
    await tx.user.update({
      where: { id: userId },
      data: {
        passwordHash: newHash,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
  });
}

export async function changePassword(auth: AuthSession, currentPassword: string, next: string, ctx: RequestContext) {
  const rl = await rateLimit("pw-change", auth.user.id, { limit: 10, windowSec: 3600, failClosed: true });
  if (!rl.allowed) throw tooMany(rl.retryAfterSec);

  const user = await db.user.findUniqueOrThrow({ where: { id: auth.user.id } });
  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    await audit({ action: "auth.password.change_failed", severity: "WARNING", actor: actorOf(user), entityType: "User", entityId: user.id, ctx });
    throw unauthorized("Current password is incorrect");
  }
  await assertNewPasswordAcceptable(user.id, user.email, user.name, next);
  await storeNewPassword(user.id, next);

  const revoked = await revokeAllSessions(user.id, auth.session.id);
  await rotateSession(auth.session.id, user.id, ctx, { twoFactorVerified: auth.session.twoFactorVerified });
  await audit({ action: "auth.password.changed", actor: actorOf(user), entityType: "User", entityId: user.id, metadata: { otherSessionsRevoked: revoked }, ctx });

  const fresh = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  return { stage: computeStage(fresh, auth.session.twoFactorVerified) };
}

const RESET_TTL_MIN = 60;

/** Creates a reset token. Returns the raw token (only ever e-mailed). */
export async function createPasswordResetToken(userId: string, ttlMinutes: number, ip: string | null): Promise<string> {
  const token = randomToken(32);
  await db.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
  await db.passwordResetToken.create({
    data: { userId, tokenHash: sha256Hex(token), expiresAt: new Date(Date.now() + ttlMinutes * 60_000), ipAddress: ip },
  });
  return token;
}

export function resetUrl(token: string): string {
  return `${env().APP_URL}/tet/admin/reset-password?token=${encodeURIComponent(token)}`;
}

/** Always resolves without revealing whether the account exists. */
export async function requestPasswordReset(emailRaw: string, ctx: RequestContext): Promise<void> {
  const email = emailRaw.trim().toLowerCase();
  const byIp = await rateLimit("pw-forgot-ip", ctx.ip ?? "unknown", { limit: 5, windowSec: 3600 });
  const byEmail = await rateLimit("pw-forgot-email", sha256Hex(email), { limit: 3, windowSec: 3600 });
  if (!byIp.allowed || !byEmail.allowed) return;

  const user = await db.user.findFirst({ where: { email, deletedAt: null, status: "ACTIVE" } });
  if (!user) {
    await audit({ action: "auth.password.reset_requested", actorEmail: email, metadata: { known: false }, ctx });
    return;
  }
  const token = await createPasswordResetToken(user.id, RESET_TTL_MIN, ctx.ip);
  await sendEmail(user.email, "auth.password_reset", { name: user.name, resetUrl: resetUrl(token), expiresMinutes: RESET_TTL_MIN });
  await audit({ action: "auth.password.reset_requested", actor: actorOf(user), entityType: "User", entityId: user.id, ctx });
}

export async function resetPasswordWithToken(token: string, next: string, ctx: RequestContext): Promise<void> {
  const rl = await rateLimit("pw-reset", ctx.ip ?? "unknown", { limit: 10, windowSec: 3600, failClosed: true });
  if (!rl.allowed) throw tooMany(rl.retryAfterSec);

  const row = await db.passwordResetToken.findUnique({ where: { tokenHash: sha256Hex(token) }, include: { user: true } });
  if (!row || row.usedAt || row.expiresAt < new Date() || row.user.deletedAt || row.user.status !== "ACTIVE") {
    throw new ApiError(400, "INVALID_TOKEN", "This link is invalid or has expired");
  }
  await assertNewPasswordAcceptable(row.userId, row.user.email, row.user.name, next);

  const { count } = await db.passwordResetToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (count !== 1) throw new ApiError(400, "INVALID_TOKEN", "This link is invalid or has expired");

  await storeNewPassword(row.userId, next);
  await revokeAllSessions(row.userId);
  await audit({ action: "auth.password.reset", severity: "WARNING", actor: actorOf(row.user), entityType: "User", entityId: row.userId, ctx });
}
