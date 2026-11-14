/**
 * Re-encrypts personal data after rotating DATA_ENCRYPTION_KEY.
 *
 * Procedure
 *   1. Generate a new key:            openssl rand -base64 32
 *   2. In .env.production:
 *        DATA_ENCRYPTION_PREVIOUS_KEY    = <old DATA_ENCRYPTION_KEY>
 *        DATA_ENCRYPTION_PREVIOUS_KEY_ID = <old DATA_ENCRYPTION_KEY_ID>
 *        DATA_ENCRYPTION_KEY             = <new key>
 *        DATA_ENCRYPTION_KEY_ID          = <new id, e.g. k2027a>
 *   3. Restart app + worker (they now write with the new key, read both).
 *   4. Run:  docker compose --env-file .env.production run --rm migrate \
 *              npx tsx scripts/rotate-encryption-key.ts [--dry-run]
 *   5. When it reports 0 remaining, remove the PREVIOUS_* variables and restart.
 *
 * Covers: members.id_number_enc (AAD "member-id:<hash>") and
 *         users.two_factor_secret_enc (AAD "totp:<userId>").
 * BLIND_INDEX_KEY is NOT rotated by this script (it would require re-hashing
 * every ID number from plaintext; rotate it only together with a full re-encrypt).
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { decrypt, encrypt, needsReencryption } from "@/lib/security/crypto";
import { env } from "@/env";

const DRY = process.argv.includes("--dry-run");
const BATCH = 500;

async function rotateMembers(): Promise<{ done: number; failed: number }> {
  let done = 0;
  let failed = 0;
  let cursor: string | undefined;
  for (;;) {
    const rows = await db.member.findMany({
      where: { idNumberEnc: { not: null }, idNumberHash: { not: null }, ...(cursor ? { id: { gt: cursor } } : {}) },
      select: { id: true, idNumberEnc: true, idNumberHash: true },
      orderBy: { id: "asc" },
      take: BATCH,
    });
    if (!rows.length) break;
    cursor = rows[rows.length - 1]!.id;
    for (const r of rows) {
      if (!needsReencryption(r.idNumberEnc!)) continue;
      try {
        const aad = `member-id:${r.idNumberHash}`;
        const plain = decrypt(r.idNumberEnc!, aad);
        if (!DRY) await db.member.update({ where: { id: r.id }, data: { idNumberEnc: encrypt(plain, aad) } });
        done++;
      } catch (err) {
        failed++;
        console.error(`member ${r.id}: ${(err as Error).message}`);
      }
    }
  }
  return { done, failed };
}

async function rotateTotpSecrets(): Promise<{ done: number; failed: number }> {
  let done = 0;
  let failed = 0;
  const users = await db.user.findMany({ where: { twoFactorSecretEnc: { not: null } }, select: { id: true, twoFactorSecretEnc: true } });
  for (const u of users) {
    if (!needsReencryption(u.twoFactorSecretEnc!)) continue;
    try {
      const aad = `totp:${u.id}`;
      const plain = decrypt(u.twoFactorSecretEnc!, aad);
      if (!DRY) await db.user.update({ where: { id: u.id }, data: { twoFactorSecretEnc: encrypt(plain, aad) } });
      done++;
    } catch (err) {
      failed++;
      console.error(`user ${u.id}: ${(err as Error).message}`);
    }
  }
  return { done, failed };
}

async function main() {
  const e = env();
  console.log(`Rotating to key id "${e.DATA_ENCRYPTION_KEY_ID}"${DRY ? " (DRY RUN)" : ""}`);
  if (!e.DATA_ENCRYPTION_PREVIOUS_KEY) console.warn("DATA_ENCRYPTION_PREVIOUS_KEY is not set — only rows already readable can be rotated.");

  const members = await rotateMembers();
  const users = await rotateTotpSecrets();
  console.table({ members, totpSecrets: users });

  if (!DRY) {
    await audit({
      action: "system.encryption_key_rotated",
      severity: "WARNING",
      actorEmail: "system@rotate-encryption-key",
      metadata: { keyId: e.DATA_ENCRYPTION_KEY_ID, members, users },
    });
  }
  if (members.failed || users.failed) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
