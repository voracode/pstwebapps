import type { Prisma } from "@/generated/prisma/client";

/**
 * KTA member number: PST-<MUN>-<YYYY>-<NNNNNN>, e.g. PST-DI-2026-000042.
 *
 * The counter row is incremented with a single INSERT … ON CONFLICT …
 * RETURNING, which Postgres executes atomically under a row lock, so two
 * coordinators approving at the same instant can never get the same number.
 * Must run inside the transaction that assigns the number, so a rollback
 * also rolls the counter back (no gaps from failed approvals).
 */
export async function nextMemberNumber(
  tx: Prisma.TransactionClient,
  municipality: { id: number; code: string },
  year = new Date().getUTCFullYear(),
): Promise<string> {
  const rows = await tx.$queryRaw<{ last_value: number }[]>`
    INSERT INTO member_number_sequences (municipality_id, year, last_value)
    VALUES (${municipality.id}, ${year}, 1)
    ON CONFLICT (municipality_id, year)
    DO UPDATE SET last_value = member_number_sequences.last_value + 1
    RETURNING last_value`;
  const seq = rows[0]?.last_value;
  if (!seq) throw new Error("Failed to allocate member number");
  return `PST-${municipality.code}-${year}-${String(seq).padStart(6, "0")}`;
}

export const MEMBER_NUMBER_RE = /^PST-[A-Z]{2}-\d{4}-\d{6}$/;
