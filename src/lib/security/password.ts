import { hash, verify, type Algorithm } from "@node-rs/argon2";

// `Algorithm` is an ambient const enum (unusable under isolatedModules);
// 2 === Algorithm.Argon2id.
const ARGON2ID = 2 as Algorithm;

/**
 * argon2id parameters — above the OWASP 2024 minimum (19 MiB, t=2, p=1),
 * sized so a 2 vCPU / 4 GB VPS can absorb login bursts behind rate limiting.
 * Changing these is safe: existing PHC strings carry their own parameters,
 * and `needsRehash` lets the login flow upgrade hashes transparently.
 */
export const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 47_104, // 46 MiB
  timeCost: 3,
  parallelism: 1,
  outputLen: 32,
} as const;

export const PASSWORD_MIN_LENGTH = 12;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain.normalize("NFKC"), ARGON2_OPTIONS);
}

export async function verifyPassword(phc: string, plain: string): Promise<boolean> {
  try {
    return await verify(phc, plain.normalize("NFKC"));
  } catch {
    return false;
  }
}

/** True when a stored hash was produced with weaker parameters than today's. */
export function needsRehash(phc: string): boolean {
  const m = /\$argon2id\$v=\d+\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(phc);
  if (!m) return true;
  const [mem = 0, time = 0, par = 0] = m.slice(1).map(Number);
  return (
    mem < ARGON2_OPTIONS.memoryCost ||
    time < ARGON2_OPTIONS.timeCost ||
    par !== ARGON2_OPTIONS.parallelism
  );
}
