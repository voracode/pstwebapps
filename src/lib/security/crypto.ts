import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { env } from "@/env";

/**
 * Field-level encryption for personal data (ID numbers, TOTP secrets).
 *
 * Format: v1.<kid>.<iv>.<ciphertext>.<tag>   (all base64url)
 * AES-256-GCM, 96-bit random IV, 128-bit tag. The key id lets us rotate keys:
 * new writes use DATA_ENCRYPTION_KEY, old rows still decrypt with
 * DATA_ENCRYPTION_PREVIOUS_KEY until a re-encryption job has run.
 */

const VERSION = "v1";

function keyring(): Map<string, Buffer> {
  const e = env();
  const ring = new Map<string, Buffer>([[e.DATA_ENCRYPTION_KEY_ID, Buffer.from(e.DATA_ENCRYPTION_KEY, "base64")]]);
  if (e.DATA_ENCRYPTION_PREVIOUS_KEY && e.DATA_ENCRYPTION_PREVIOUS_KEY_ID) {
    ring.set(e.DATA_ENCRYPTION_PREVIOUS_KEY_ID, Buffer.from(e.DATA_ENCRYPTION_PREVIOUS_KEY, "base64"));
  }
  return ring;
}

export function encrypt(plain: string, aad?: string): string {
  const e = env();
  const key = Buffer.from(e.DATA_ENCRYPTION_KEY, "base64");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  if (aad) cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, e.DATA_ENCRYPTION_KEY_ID, iv.toString("base64url"), ct.toString("base64url"), tag.toString("base64url")].join(".");
}

export function decrypt(payload: string, aad?: string): string {
  const [version, kid, ivB64, ctB64, tagB64] = payload.split(".");
  if (version !== VERSION || !kid || !ivB64 || !ctB64 || !tagB64) throw new Error("Malformed ciphertext");
  const key = keyring().get(kid);
  if (!key) throw new Error(`Unknown encryption key id "${kid}"`);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
  if (aad) decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64url")), decipher.final()]).toString("utf8");
}

/** True when the value was encrypted with a key other than the current one. */
export function needsReencryption(payload: string): boolean {
  return payload.split(".")[1] !== env().DATA_ENCRYPTION_KEY_ID;
}

/**
 * Deterministic keyed hash for exact-match lookups on encrypted or private
 * values (ID-number dedup, IP throttling). `purpose` domain-separates uses so
 * the same input never yields the same index in two contexts.
 */
export function blindIndex(purpose: string, value: string): string {
  return createHmac("sha256", Buffer.from(env().BLIND_INDEX_KEY, "base64"))
    .update(`${purpose}:${value}`)
    .digest("hex");
}

/** Normalise an ID number before hashing: uppercase, strip spaces/dashes/dots. */
export function normalizeIdNumber(value: string): string {
  return value.toUpperCase().replace(/[\s.\-/]/g, "");
}

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

/** URL-safe random token; 32 bytes = 256 bits. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Human-friendly random code without ambiguous characters (I, L, O, U). */
export function randomCode(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += CROCKFORD[bytes[i]! & 31];
  return out;
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** HMAC with a key derived from AUTH_SECRET — for signed URLs and similar. */
export function hmacSign(purpose: string, data: string): string {
  return createHmac("sha256", env().AUTH_SECRET).update(`${purpose}:${data}`).digest("base64url");
}
