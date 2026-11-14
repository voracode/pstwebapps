import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/env";
import { hmacSign, randomToken, safeEqual } from "@/lib/security/crypto";

/**
 * Local-disk object storage (Docker volume on the VPS).
 *
 *   <root>/public/...   served directly by Nginx at STORAGE_PUBLIC_BASE_URL
 *   <root>/private/...  only via /api/files with a short-lived HMAC signature
 *
 * Keys are generated server-side (random names), never taken from user input.
 */

export type Visibility = "PUBLIC" | "PRIVATE";

const KEY_RE = /^(public|private)\/[a-z0-9][a-z0-9/_.-]*$/i;

function root(): string {
  return path.resolve(env().STORAGE_LOCAL_PATH);
}

export function isValidKey(key: string): boolean {
  return KEY_RE.test(key) && !key.includes("..") && !key.includes("//");
}

function resolveKey(key: string): string {
  if (!isValidKey(key)) throw new Error(`Invalid storage key: ${key}`);
  const base = root();
  const full = path.resolve(base, key);
  if (!full.startsWith(base + path.sep)) throw new Error("Storage key escapes root");
  return full;
}

export function newKey(visibility: Visibility, folder: string, ext: string): string {
  const d = new Date();
  const safeFolder = folder.toLowerCase().replace(/[^a-z0-9/_-]/g, "");
  return [
    visibility.toLowerCase(),
    safeFolder,
    String(d.getUTCFullYear()),
    String(d.getUTCMonth() + 1).padStart(2, "0"),
    `${randomToken(12)}.${ext.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
  ].join("/");
}

export async function putObject(key: string, data: Buffer): Promise<void> {
  const full = resolveKey(key);
  await mkdir(path.dirname(full), { recursive: true });
  // Public files are served directly by Nginx (a different uid) → world-readable;
  // private files (ID scans, KTA cards) stay owner-only.
  await writeFile(full, data, { mode: key.startsWith("public/") ? 0o644 : 0o600, flag: "wx" });
}

export async function getObject(key: string): Promise<Buffer> {
  return readFile(resolveKey(key));
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    return (await stat(resolveKey(key))).isFile();
  } catch {
    return false;
  }
}

export async function deleteObject(key: string): Promise<void> {
  await rm(resolveKey(key), { force: true });
}

/** URL for a PUBLIC object (Nginx serves STORAGE_PUBLIC_BASE_URL → <root>/public). */
export function publicUrl(key: string): string {
  if (!key.startsWith("public/")) throw new Error("Not a public object");
  return `${env().STORAGE_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key.slice("public/".length)}`;
}

/** Short-lived signed URL for a PRIVATE object, served by /api/files. */
export function signedUrl(key: string, ttlSec = env().STORAGE_SIGNED_URL_TTL_SECONDS): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const sig = hmacSign("file", `${key}:${exp}`);
  return `/api/files/${key}?exp=${exp}&sig=${sig}`;
}

export function verifySignedUrl(key: string, exp: string | null, sig: string | null): boolean {
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) < Date.now() / 1000) return false;
  return safeEqual(hmacSign("file", `${key}:${exp}`), sig);
}

export function urlFor(key: string): string {
  return key.startsWith("public/") ? publicUrl(key) : signedUrl(key);
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  mp4: "video/mp4",
  webm: "video/webm",
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export function mimeFromKey(key: string): string {
  return MIME_BY_EXT[key.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}
