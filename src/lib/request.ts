import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { env } from "@/env";

export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
  requestId: string;
}

/**
 * Client IP. Behind Nginx we trust X-Real-IP (set by our proxy, never by the
 * client); the left-most X-Forwarded-For entry is the fallback. With
 * TRUST_PROXY=false both headers are ignored.
 */
export function clientIp(headers: Headers): string | null {
  if (!env().TRUST_PROXY) return null;
  const real = headers.get("x-real-ip")?.trim();
  if (real && isIP(real)) return real;
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (fwd && isIP(fwd)) return fwd;
  return null;
}

export function requestContext(headers: Headers): RequestContext {
  const ua = headers.get("user-agent");
  return {
    ip: clientIp(headers),
    userAgent: ua ? ua.slice(0, 512) : null,
    requestId: headers.get("x-request-id")?.slice(0, 64) || randomUUID(),
  };
}
