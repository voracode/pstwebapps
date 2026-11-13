import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { env, isProd } from "@/env";
import type { RequestContext } from "@/lib/request";
import type { Role, User, UserSession } from "@/generated/prisma/client";
import { randomToken, sha256Hex } from "./crypto";

/**
 * Backoffice sessions: opaque random token in an HttpOnly cookie, only its
 * SHA-256 stored in `user_sessions`. Sessions are revocable instantly
 * (lockout, suspension, password change, "log out everywhere").
 *
 * A session moves through stages:
 *   TWO_FACTOR_REQUIRED        – password OK, TOTP pending
 *   PASSWORD_CHANGE_REQUIRED   – first login / expired password
 *   TWO_FACTOR_SETUP_REQUIRED  – role mandates 2FA but it isn't enrolled
 *   ACTIVE                     – full access (subject to RBAC)
 */

export type SessionStage =
  | "TWO_FACTOR_REQUIRED"
  | "PASSWORD_CHANGE_REQUIRED"
  | "TWO_FACTOR_SETUP_REQUIRED"
  | "ACTIVE";

export type SessionUser = Pick<
  User,
  | "id"
  | "email"
  | "name"
  | "role"
  | "status"
  | "municipalityId"
  | "preferredLocale"
  | "twoFactorEnabled"
  | "mustChangePassword"
  | "passwordChangedAt"
  | "telegramChatId"
>;

export interface AuthSession {
  session: Pick<UserSession, "id" | "twoFactorVerified" | "expiresAt" | "createdAt">;
  user: SessionUser;
  stage: SessionStage;
}

const LAST_SEEN_THROTTLE_MS = 60_000;

export function cookieName(): string {
  // The __Host- prefix requires Secure, which browsers only allow on https
  // (and localhost). Drop it in development to keep plain-http tooling working.
  const name = env().SESSION_COOKIE_NAME;
  return isProd() ? name : name.replace(/^__Host-/, "");
}

export function computeStage(user: SessionUser, twoFactorVerified: boolean): SessionStage {
  const e = env();
  if (user.twoFactorEnabled && !twoFactorVerified) return "TWO_FACTOR_REQUIRED";
  if (user.mustChangePassword) return "PASSWORD_CHANGE_REQUIRED";
  if (e.PASSWORD_MAX_AGE_DAYS > 0 && user.passwordChangedAt) {
    const ageDays = (Date.now() - user.passwordChangedAt.getTime()) / 86_400_000;
    if (ageDays > e.PASSWORD_MAX_AGE_DAYS) return "PASSWORD_CHANGE_REQUIRED";
  }
  if (!user.twoFactorEnabled && e.TWO_FACTOR_REQUIRED_ROLES.includes(user.role as Role)) {
    return "TWO_FACTOR_SETUP_REQUIRED";
  }
  return "ACTIVE";
}

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  municipalityId: true,
  preferredLocale: true,
  twoFactorEnabled: true,
  mustChangePassword: true,
  passwordChangedAt: true,
  telegramChatId: true,
  deletedAt: true,
} as const;

async function setCookie(token: string, expiresAt: Date) {
  (await cookies()).set({
    name: cookieName(),
    value: token,
    httpOnly: true,
    secure: isProd(),
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(cookieName());
}

/** Creates a session row and sets the cookie. */
export async function createSession(
  userId: string,
  ctx: Pick<RequestContext, "ip" | "userAgent">,
  opts: { twoFactorVerified?: boolean } = {},
): Promise<string> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + env().SESSION_TTL_HOURS * 3_600_000);
  const row = await db.userSession.create({
    data: {
      userId,
      tokenHash: sha256Hex(token),
      twoFactorVerified: opts.twoFactorVerified ?? false,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
      expiresAt,
    },
    select: { id: true },
  });
  await setCookie(token, expiresAt);
  return row.id;
}

/**
 * Replaces the current session with a fresh token (prevents session
 * fixation after privilege changes: 2FA passed, password changed).
 */
export async function rotateSession(
  currentSessionId: string,
  userId: string,
  ctx: Pick<RequestContext, "ip" | "userAgent">,
  opts: { twoFactorVerified: boolean },
): Promise<string> {
  await db.userSession.update({ where: { id: currentSessionId }, data: { revokedAt: new Date() } });
  return createSession(userId, ctx, opts);
}

/** Resolves the current request's session, or null. */
export async function getSession(ctx?: Pick<RequestContext, "ip">): Promise<AuthSession | null> {
  const token = (await cookies()).get(cookieName())?.value;
  if (!token || token.length > 100) return null;

  const row = await db.userSession.findUnique({
    where: { tokenHash: sha256Hex(token) },
    include: { user: { select: userSelect } },
  });
  if (!row || row.revokedAt) return null;

  const now = Date.now();
  if (row.expiresAt.getTime() <= now) return null;

  const idleMs = env().SESSION_IDLE_TIMEOUT_MINUTES * 60_000;
  if (now - row.lastSeenAt.getTime() > idleMs) {
    await db.userSession.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
    return null;
  }

  const { deletedAt, ...user } = row.user;
  if (user.status !== "ACTIVE" || deletedAt) return null;

  if (now - row.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
    await db.userSession.update({
      where: { id: row.id },
      data: { lastSeenAt: new Date(), ...(ctx?.ip ? { ipAddress: ctx.ip } : {}) },
    });
  }

  return {
    session: { id: row.id, twoFactorVerified: row.twoFactorVerified, expiresAt: row.expiresAt, createdAt: row.createdAt },
    user,
    stage: computeStage(user, row.twoFactorVerified),
  };
}

export async function revokeSession(sessionId: string) {
  await db.userSession.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
}

/** Revokes every active session of a user, optionally keeping one. */
export async function revokeAllSessions(userId: string, exceptSessionId?: string): Promise<number> {
  const { count } = await db.userSession.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });
  return count;
}

/** Housekeeping, run by the worker: drops sessions expired > 30 days ago. */
export async function purgeOldSessions(): Promise<number> {
  const { count } = await db.userSession.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 30 * 86_400_000) } },
  });
  return count;
}
