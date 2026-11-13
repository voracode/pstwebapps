import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import { env } from "@/env";
import { ApiError } from "@/lib/http";
import { canonicalJson } from "@/lib/utils/canonical-json";

/**
 * Ed25519 signatures for KTA cards. The signed payload is stored with the
 * card; the public QR verification endpoint re-verifies it, so a card row
 * edited directly in the database (or a forged card) fails verification.
 *
 * Key rotation: issue new cards with a new KTA_SIGNING_KEY_ID and keep old
 * public keys in KTA_SIGNING_PREVIOUS_PUBLIC_KEYS='{"kta-2026-1":"-----BEGIN…"}'.
 */

export interface KtaPayload {
  v: 1;
  kid: string;
  /** member number */
  num: string;
  name: string;
  /** município code */
  mun: string;
  rank: string;
  /** card version */
  ver: number;
  /** issue / expiry dates (YYYY-MM-DD) */
  iss: string;
  exp: string;
  /** member's QR token — binds the signature to the QR printed on the card */
  qr: string;
}

const pem = (v: string) => v.replace(/\\n/g, "\n").trim();

let cachedPrivate: KeyObject | undefined;
const publicKeys = new Map<string, KeyObject>();

function privateKey(): KeyObject {
  if (cachedPrivate) return cachedPrivate;
  const raw = env().KTA_SIGNING_PRIVATE_KEY;
  if (!raw) throw new ApiError(503, "KTA_NOT_CONFIGURED", "KTA signing key is not configured");
  cachedPrivate = createPrivateKey(pem(raw));
  if (cachedPrivate.asymmetricKeyType !== "ed25519") throw new Error("KTA_SIGNING_PRIVATE_KEY must be an Ed25519 key");
  return cachedPrivate;
}

function publicKey(kid: string): KeyObject | null {
  const hit = publicKeys.get(kid);
  if (hit) return hit;
  const e = env();
  let source: string | undefined;
  if (kid === e.KTA_SIGNING_KEY_ID) {
    source = e.KTA_SIGNING_PUBLIC_KEY;
    if (!source && e.KTA_SIGNING_PRIVATE_KEY) {
      const key = createPublicKey(privateKey());
      publicKeys.set(kid, key);
      return key;
    }
  } else {
    try {
      source = (JSON.parse(process.env.KTA_SIGNING_PREVIOUS_PUBLIC_KEYS ?? "{}") as Record<string, string>)[kid];
    } catch {
      source = undefined;
    }
  }
  if (!source) return null;
  const key = createPublicKey(pem(source));
  publicKeys.set(kid, key);
  return key;
}

export function currentKid(): string {
  return env().KTA_SIGNING_KEY_ID;
}

export function signPayload(payload: KtaPayload): string {
  return sign(null, Buffer.from(canonicalJson(payload)), privateKey()).toString("base64url");
}

export function verifyPayload(payload: KtaPayload, signature: string, kid: string): boolean {
  const key = publicKey(kid);
  if (!key) return false;
  try {
    return verify(null, Buffer.from(canonicalJson(payload)), key, Buffer.from(signature, "base64url"));
  } catch {
    return false;
  }
}
