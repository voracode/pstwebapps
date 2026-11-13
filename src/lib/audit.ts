import { db } from "@/lib/db";
import { sha256Hex } from "@/lib/security/crypto";
import { canonicalJson } from "@/lib/utils/canonical-json";
import { alertAdmins } from "@/lib/notify";
import type { RequestContext } from "@/lib/request";
import type { AuditSeverity, Prisma, Role } from "@/generated/prisma/client";

/**
 * Append-only, hash-chained audit trail.
 *
 *   hash = SHA-256( prevHash + canonicalJson(row fields) )
 *
 * A transaction-scoped advisory lock serialises writers so the chain never
 * forks. Verification (`verifyAuditChain`) recomputes every hash; any
 * edited, inserted or deleted row breaks the chain from that point on.
 */

const CHAIN_LOCK_KEY = 0x50_53_54_41; // "PSTA"

export interface AuditActor {
  id: string;
  email: string;
  role: Role;
}

export interface AuditEntry {
  action: string;
  severity?: AuditSeverity;
  actor?: AuditActor | null;
  /** Used when there is no logged-in actor (e.g. failed login for an e-mail). */
  actorEmail?: string | null;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ctx?: Partial<RequestContext>;
}

interface HashedFields {
  actorId: string | null;
  actorEmail: string | null;
  actorRole: Role | null;
  action: string;
  severity: AuditSeverity;
  entityType: string | null;
  entityId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: Date;
}

function computeHash(prevHash: string | null, f: HashedFields): string {
  return sha256Hex((prevHash ?? "GENESIS") + canonicalJson(f));
}

/** Writes an audit row. Never throws — an audit failure is logged loudly instead. */
export async function audit(entry: AuditEntry): Promise<void> {
  const fields: HashedFields = {
    actorId: entry.actor?.id ?? null,
    actorEmail: entry.actor?.email ?? entry.actorEmail ?? null,
    actorRole: entry.actor?.role ?? null,
    action: entry.action,
    severity: entry.severity ?? "INFO",
    entityType: entry.entityType ?? null,
    entityId: entry.entityId ?? null,
    metadata: entry.metadata ?? null,
    ipAddress: entry.ctx?.ip ?? null,
    userAgent: entry.ctx?.userAgent ?? null,
    requestId: entry.ctx?.requestId ?? null,
    // Millisecond precision matches Postgres timestamp(3), so re-hashing is stable.
    createdAt: new Date(),
  };

  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CHAIN_LOCK_KEY})`;
      // Hash the IP exactly as Postgres will store/return it (inet canonical form,
      // e.g. "2001:0db8::0001" → "2001:db8::1"), so verification re-hashes identically.
      if (fields.ipAddress) {
        const [row] = await tx.$queryRaw<{ ip: string }[]>`SELECT host(${fields.ipAddress}::inet) AS ip`;
        fields.ipAddress = row?.ip ?? null;
      }
      const last = await tx.auditLog.findFirst({ orderBy: { id: "desc" }, select: { hash: true } });
      const prevHash = last?.hash ?? null;
      await tx.auditLog.create({
        data: {
          ...fields,
          metadata: (fields.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
          prevHash,
          hash: computeHash(prevHash, fields),
        },
      });
    });
  } catch (err) {
    console.error("[audit] FAILED to write audit log", { action: entry.action, err });
  }

  if (fields.severity === "CRITICAL") {
    await alertAdmins("security", "security.alert", {
      action: fields.action,
      actorEmail: fields.actorEmail,
      ip: fields.ipAddress,
      details: entry.metadata ? JSON.stringify(entry.metadata).slice(0, 500) : undefined,
    });
  }
}

export interface ChainVerification {
  ok: boolean;
  checked: number;
  firstBrokenId?: string;
  reason?: string;
}

/** Recomputes the whole chain in batches. Intended for the AUDITOR role. */
export async function verifyAuditChain(batchSize = 2000): Promise<ChainVerification> {
  let prevHash: string | null = null;
  let cursor: bigint | undefined;
  let checked = 0;

  for (;;) {
    const rows = await db.auditLog.findMany({
      where: cursor ? { id: { gt: cursor } } : undefined,
      orderBy: { id: "asc" },
      take: batchSize,
    });
    if (rows.length === 0) break;

    for (const r of rows) {
      if (r.prevHash !== prevHash) {
        return { ok: false, checked, firstBrokenId: r.id.toString(), reason: "prevHash does not link to previous row" };
      }
      const expected = computeHash(prevHash, {
        actorId: r.actorId,
        actorEmail: r.actorEmail,
        actorRole: r.actorRole,
        action: r.action,
        severity: r.severity,
        entityType: r.entityType,
        entityId: r.entityId,
        metadata: r.metadata,
        ipAddress: r.ipAddress,
        userAgent: r.userAgent,
        requestId: r.requestId,
        createdAt: r.createdAt,
      });
      if (expected !== r.hash) {
        return { ok: false, checked, firstBrokenId: r.id.toString(), reason: "row content does not match its hash" };
      }
      prevHash = r.hash;
      checked++;
    }
    cursor = rows[rows.length - 1]!.id;
  }

  return { ok: true, checked };
}
