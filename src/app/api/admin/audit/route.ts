import { z } from "zod";
import { db } from "@/lib/db";
import { adminRoute, ok, pageMeta, paginate, paginationSchema, parseQuery } from "@/lib/http";
import { optionalText } from "@/lib/validation/common";
import type { Prisma } from "@/generated/prisma/client";

const listSchema = paginationSchema.extend({
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  action: optionalText(80),
  actorId: optionalText(40),
  actorEmail: optionalText(160),
  entityType: optionalText(60),
  entityId: optionalText(64),
  severity: z.enum(["INFO", "WARNING", "CRITICAL"]).optional(),
  ip: optionalText(64),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

/** GET /api/admin/audit — security & action trail (AUDITOR, SUPER_ADMIN, NATIONAL_SECRETARY). */
export const GET = adminRoute({ permission: "audit:read" }, async ({ req }) => {
  const q = parseQuery(req, listSchema);
  const where: Prisma.AuditLogWhereInput = {
    // Prefix match lets "auth." select every auth event.
    ...(q.action ? { action: { startsWith: q.action } } : {}),
    actorId: q.actorId,
    ...(q.actorEmail ? { actorEmail: { contains: q.actorEmail, mode: "insensitive" } } : {}),
    entityType: q.entityType,
    entityId: q.entityId,
    severity: q.severity,
    ipAddress: q.ip,
    ...(q.from || q.to ? { createdAt: { gte: q.from, lte: q.to } } : {}),
  };
  const { skip, take } = paginate(q.page, q.pageSize);
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { id: "desc" }, skip, take }),
    db.auditLog.count({ where }),
  ]);
  return ok({ items: rows.map((r) => ({ ...r, id: r.id.toString() })), meta: pageMeta(total, q.page, q.pageSize) });
});
