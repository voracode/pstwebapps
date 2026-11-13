import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { QUEUE_KEY } from "@/lib/notify";
import { isMunicipalScoped } from "@/lib/security/rbac";
import type { AuthSession } from "@/lib/security/session";
import { Prisma } from "@/generated/prisma/client";

/**
 * Executive analytics. Aggregations run in SQL; coordinators automatically
 * get numbers for their own município only.
 */
export async function dashboardStats(auth: AuthSession) {
  const munId = isMunicipalScoped(auth.user) ? (auth.user.municipalityId ?? -1) : null;
  const memberScope = munId !== null ? Prisma.sql`AND m.municipality_id = ${munId}` : Prisma.empty;
  const aspScope = munId !== null ? Prisma.sql`AND a.municipality_id = ${munId}` : Prisma.empty;

  const [byStatus, byMunicipality, byGender, byAge, daily, aspirations, topPosts, pendingOldest] = await Promise.all([
    db.$queryRaw<{ status: string; n: bigint }[]>`
      SELECT m.status::text AS status, COUNT(*) AS n FROM members m
      WHERE m.deleted_at IS NULL ${memberScope} GROUP BY 1`,

    db.$queryRaw<{ code: string; name: string; verified: bigint; pending: bigint; total: bigint }[]>`
      SELECT mu.code, mu.name,
        COUNT(m.id) FILTER (WHERE m.status = 'VERIFIED') AS verified,
        COUNT(m.id) FILTER (WHERE m.status = 'PENDING')  AS pending,
        COUNT(m.id) AS total
      FROM municipalities mu
      LEFT JOIN members m ON m.municipality_id = mu.id AND m.deleted_at IS NULL
      ${munId !== null ? Prisma.sql`WHERE mu.id = ${munId}` : Prisma.empty}
      GROUP BY mu.id ORDER BY mu.sort_order`,

    db.$queryRaw<{ gender: string; n: bigint }[]>`
      SELECT m.gender::text AS gender, COUNT(*) AS n FROM members m
      WHERE m.deleted_at IS NULL AND m.status = 'VERIFIED' ${memberScope} GROUP BY 1`,

    db.$queryRaw<{ bucket: string; n: bigint }[]>`
      SELECT CASE
          WHEN age < 25 THEN '17-24'
          WHEN age < 35 THEN '25-34'
          WHEN age < 45 THEN '35-44'
          WHEN age < 55 THEN '45-54'
          WHEN age < 65 THEN '55-64'
          ELSE '65+' END AS bucket,
        COUNT(*) AS n
      FROM (SELECT date_part('year', age(current_date, m.birth_date)) AS age FROM members m
            WHERE m.deleted_at IS NULL AND m.status = 'VERIFIED' ${memberScope}) t
      GROUP BY 1 ORDER BY 1`,

    db.$queryRaw<{ day: Date; n: bigint }[]>`
      SELECT d::date AS day, COUNT(m.id) AS n
      FROM generate_series(current_date - interval '29 days', current_date, interval '1 day') d
      LEFT JOIN members m ON (m.created_at AT TIME ZONE 'Asia/Dili')::date = d::date AND m.deleted_at IS NULL ${memberScope}
      GROUP BY 1 ORDER BY 1`,

    db.$queryRaw<{ status: string; n: bigint }[]>`
      SELECT a.status::text AS status, COUNT(*) AS n FROM aspirations a WHERE true ${aspScope} GROUP BY 1`,

    munId === null
      ? db.$queryRaw<{ id: string; title: string; views: bigint }[]>`
          SELECT p.id, COALESCE(tt.title, tp.title) AS title, SUM(v.views) AS views
          FROM post_views_daily v
          JOIN posts p ON p.id = v.post_id AND p.deleted_at IS NULL
          LEFT JOIN post_translations tt ON tt.post_id = p.id AND tt.locale = 'tet'
          LEFT JOIN post_translations tp ON tp.post_id = p.id AND tp.locale = 'pt'
          WHERE v.day >= current_date - 30
          GROUP BY p.id, tt.title, tp.title ORDER BY views DESC LIMIT 5`
      : Promise.resolve([]),

    db.member.findFirst({
      where: { status: "PENDING", deletedAt: null, ...(munId !== null ? { municipalityId: munId } : {}) },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
  ]);

  const n = (x: bigint) => Number(x);
  const statusMap = Object.fromEntries(byStatus.map((s) => [s.status, n(s.n)]));
  return {
    scope: munId !== null ? { municipalityId: munId } : "national",
    members: {
      total: Object.values(statusMap).reduce((a, b) => a + b, 0),
      byStatus: statusMap,
      byMunicipality: byMunicipality.map((r) => ({ code: r.code, name: r.name, verified: n(r.verified), pending: n(r.pending), total: n(r.total) })),
      byGender: Object.fromEntries(byGender.map((g) => [g.gender, n(g.n)])),
      byAgeGroup: byAge.map((a) => ({ group: a.bucket, count: n(a.n) })),
      registrationsLast30Days: daily.map((d) => ({ day: d.day.toISOString().slice(0, 10), count: n(d.n) })),
      oldestPendingSince: pendingOldest?.createdAt ?? null,
    },
    aspirations: Object.fromEntries(aspirations.map((a) => [a.status, n(a.n)])),
    topPosts30Days: topPosts.map((p) => ({ id: p.id, title: p.title, views: n(p.views) })),
  };
}

export async function systemHealth() {
  const t0 = Date.now();
  const checks: Record<string, { ok: boolean; latencyMs?: number; detail?: string }> = {};

  try {
    await db.$queryRaw`SELECT 1`;
    checks.database = { ok: true, latencyMs: Date.now() - t0 };
  } catch (e) {
    checks.database = { ok: false, detail: (e as Error).message };
  }

  const t1 = Date.now();
  try {
    await redis().ping();
    const depth = await redis().llen(QUEUE_KEY);
    checks.redis = { ok: true, latencyMs: Date.now() - t1 };
    checks.queue = { ok: depth < 500, detail: `${depth} pending` };
  } catch (e) {
    checks.redis = { ok: false, detail: (e as Error).message };
  }

  if (checks.database.ok) {
    const failed = await db.notificationOutbox.count({ where: { status: "FAILED", createdAt: { gte: new Date(Date.now() - 86_400_000) } } });
    checks.notifications = { ok: failed < 20, detail: `${failed} failed in 24h` };
  }

  const ok = Object.values(checks).every((c) => c.ok);
  return { status: ok ? "ok" : "degraded", checks, uptimeSec: Math.round(process.uptime()), time: new Date().toISOString() };
}
