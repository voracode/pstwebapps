import { Secret, TOTP } from "otpauth";
import { env } from "@/env";
import { redis } from "@/lib/redis";
import { blindIndex, randomCode, safeEqual } from "./crypto";

/**
 * TOTP (RFC 6238): SHA-1, 6 digits, 30 s — the parameters every
 * authenticator app supports. ±1 step tolerance for clock drift.
 */
const PERIOD = 30;

function totp(secretBase32: string, label: string) {
  return new TOTP({
    issuer: env().TOTP_ISSUER,
    label,
    algorithm: "SHA1",
    digits: 6,
    period: PERIOD,
    secret: Secret.fromBase32(secretBase32),
  });
}

export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

export function totpUri(secretBase32: string, accountEmail: string): string {
  return totp(secretBase32, accountEmail).toString();
}

/**
 * Validates a code and blocks replay: each accepted time-step is remembered
 * in Redis for the tolerance window, so a sniffed code can't be reused.
 */
export async function verifyTotp(userId: string, secretBase32: string, code: string): Promise<boolean> {
  const token = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(token)) return false;
  const delta = totp(secretBase32, userId).validate({ token, window: 1 });
  if (delta === null) return false;

  const step = Math.floor(Date.now() / 1000 / PERIOD) + delta;
  const set = await redis().set(`totp:used:${userId}:${step}`, "1", "EX", PERIOD * 3, "NX");
  return set === "OK";
}

// -----------------------------------------------------------------------------
// Recovery codes — 10 single-use codes, ~50 bits each, shown once.
// Stored as keyed HMACs: high-entropy codes don't need a slow hash.
// -----------------------------------------------------------------------------
export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const c = randomCode(10);
    return `${c.slice(0, 5)}-${c.slice(5)}`;
  });
}

export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export function hashRecoveryCode(code: string): string {
  return blindIndex("recovery-code", normalizeRecoveryCode(code));
}

export function recoveryCodeMatches(code: string, hash: string): boolean {
  return safeEqual(hashRecoveryCode(code), hash);
}
