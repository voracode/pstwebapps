import { env } from "@/env";
import { ApiError } from "@/lib/http";

/**
 * Cloudflare Turnstile verification for public forms. When no secret is
 * configured the check is skipped (rate limiting still applies).
 */
export async function assertHuman(token: string | undefined | null, ip: string | null): Promise<void> {
  const secret = env().TURNSTILE_SECRET_KEY;
  if (!secret) return;
  if (!token) throw new ApiError(400, "CAPTCHA_REQUIRED", "Please complete the verification challenge");

  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);

  let success = false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8_000),
    });
    success = ((await res.json()) as { success?: boolean }).success === true;
  } catch (err) {
    // Fail open on provider outage: rate limits remain the primary control.
    console.error("[turnstile] verification unavailable:", (err as Error).message);
    return;
  }
  if (!success) throw new ApiError(400, "CAPTCHA_FAILED", "Verification challenge failed, please retry");
}
