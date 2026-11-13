import { NextResponse } from "next/server";
import { env } from "@/env";
import { publicRoute } from "@/lib/http";
import { safeEqual } from "@/lib/security/crypto";
import { systemHealth } from "@/server/services/dashboard.service";

/**
 * GET /api/health            → 200 {status} / 503 — for Docker & uptime checks.
 * GET /api/health?details=1  with "Authorization: Bearer <HEALTHCHECK_TOKEN>" → per-component detail.
 */
export const GET = publicRoute(async ({ req }) => {
  const h = await systemHealth();
  const token = env().HEALTHCHECK_TOKEN;
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const detailed = req.nextUrl.searchParams.get("details") === "1" && !!token && safeEqual(bearer, token);
  return NextResponse.json(detailed ? h : { status: h.status }, {
    status: h.status === "ok" ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
});
