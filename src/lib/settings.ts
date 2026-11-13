import { db } from "@/lib/db";

/**
 * Site settings with a small in-process cache (60 s). Values are edited in
 * the backoffice; a short TTL keeps multi-instance deployments consistent
 * without cross-process invalidation.
 */
const TTL_MS = 60_000;
const cache = new Map<string, { value: unknown; at: number }>();

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return (hit.value ?? fallback) as T;
  const row = await db.siteSetting.findUnique({ where: { key } });
  const value = row ? (row.value as T) : fallback;
  cache.set(key, { value, at: Date.now() });
  return value;
}

export function invalidateSetting(key?: string) {
  if (key) cache.delete(key);
  else cache.clear();
}
