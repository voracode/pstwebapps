import { PASSWORD_MIN_LENGTH } from "./password";

export const PASSWORD_MAX_LENGTH = 128;

// Most common passwords plus party/locale-specific guesses.
const DENYLIST = new Set([
  "password", "password123", "passw0rd", "123456789012", "qwertyuiopas", "iloveyou1234",
  "adminadmin12", "administrator", "welcome12345", "changeme1234", "letmein12345",
  "timorleste123", "timor-leste1", "timorleste2026", "dili12345678", "pstpstpstpst",
  "partidosocialista", "pelprogresso", "peloprogresso", "igualdade123", "socialista123",
]);

export interface PolicyContext {
  email: string;
  name?: string;
}

/** Returns a list of violated rules (empty = acceptable). */
export function checkPasswordPolicy(password: string, ctx: PolicyContext): string[] {
  const errors: string[] = [];
  const lower = password.toLowerCase();

  if (password.length < PASSWORD_MIN_LENGTH) errors.push(`At least ${PASSWORD_MIN_LENGTH} characters`);
  if (password.length > PASSWORD_MAX_LENGTH) errors.push(`At most ${PASSWORD_MAX_LENGTH} characters`);

  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  // Long passphrases (≥ 20 chars) are fine without character-class mixing.
  if (password.length < 20 && classes < 3) {
    errors.push("Use at least 3 of: lowercase, uppercase, digit, symbol — or a passphrase of 20+ characters");
  }

  if (DENYLIST.has(lower) || DENYLIST.has(lower.replace(/[^a-z0-9]/g, ""))) errors.push("Too common");
  if (/^(.)\1+$/.test(password)) errors.push("Must not be a single repeated character");

  const local = ctx.email.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) errors.push("Must not contain your e-mail name");
  for (const part of (ctx.name ?? "").toLowerCase().split(/\s+/)) {
    if (part.length >= 4 && lower.includes(part)) {
      errors.push("Must not contain your name");
      break;
    }
  }
  return errors;
}
