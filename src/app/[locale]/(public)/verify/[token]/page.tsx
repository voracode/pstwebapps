import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BadgeCheck, ShieldX, TriangleAlert, UserRound } from "lucide-react";
import { Emblem } from "@/components/brand/emblem";
import { Alert } from "@/components/ui/primitives";
import { asLocale } from "@/components/public/locale";
import { clientIp } from "@/lib/request";
import { blindIndex } from "@/lib/security/crypto";
import { rateLimit } from "@/lib/security/rate-limit";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils/cn";
import { verifyByQrToken, type VerificationResult } from "@/server/services/kta.service";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string; token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "public.verify" });
  return { title: t("title"), robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer" };
}

async function verify(token: string): Promise<VerificationResult | "RATE_LIMITED"> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { valid: false, reason: "NOT_FOUND" };
  try {
    const ip = clientIp(await headers());
    const rl = await rateLimit("verify", blindIndex("ip", ip ?? "unknown"), { limit: 60, windowSec: 600 });
    if (!rl.allowed) return "RATE_LIMITED";
  } catch {
    /* rate limiter unavailable: still answer the verification */
  }
  return verifyByQrToken(token);
}

export default async function VerifyPage({ params }: Props) {
  const { locale: raw, token } = await params;
  const locale = asLocale(raw);
  setRequestLocale(locale);
  const t = await getTranslations("public.verify");
  const tc = await getTranslations("common");
  const res = await verify(decodeURIComponent(token));

  if (res === "RATE_LIMITED") {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Alert variant="warning">{tc("errors.rateLimited")}</Alert>
      </div>
    );
  }

  const reason = res.reason === "NO_ACTIVE_CARD" ? "NOT_FOUND" : res.reason;
  const ok = res.valid && reason === "OK";
  const warn = reason === "EXPIRED" || reason === "MEMBER_NOT_ACTIVE";
  const member = "member" in res ? res.member : null;
  const card = "card" in res ? res.card : null;
  const Icon = ok ? BadgeCheck : warn ? TriangleAlert : ShieldX;
  const title = ok ? t("valid") : t(reason as "EXPIRED");
  const body = ok ? t("validBody") : t(`${reason}_body` as "EXPIRED_body");

  return (
    <div className="mx-auto max-w-lg px-4 py-10 sm:py-16">
      <div className="mb-6 flex items-center justify-center gap-3">
        <Emblem size={48} />
        <h1 className="font-display text-xl font-extrabold uppercase">{t("title")}</h1>
      </div>
      <section
        className={cn(
          "overflow-hidden rounded-2xl border-4 bg-card shadow-lg",
          ok ? "border-green-600" : warn ? "border-amber-500" : "border-red-600",
        )}
        aria-live="polite"
      >
        <div className={cn("flex items-center gap-4 p-5 text-white", ok ? "bg-green-600" : warn ? "bg-amber-600" : "bg-red-600")}>
          <Icon className="size-12 shrink-0" aria-hidden strokeWidth={2.2} />
          <div>
            <p className="font-display text-3xl font-extrabold uppercase leading-none">{title}</p>
            <p className="mt-1 text-sm text-white/95">{body}</p>
          </div>
        </div>
        {member && reason !== "SIGNATURE_INVALID" && (
          <div className="flex gap-4 p-5">
            <div className="flex h-32 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
              {member.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={member.photoUrl} alt={t("photoAlt")} className="size-full object-cover" />
              ) : (
                <UserRound className="size-12 text-muted-foreground/50" aria-hidden />
              )}
            </div>
            <dl className="min-w-0 flex-1 space-y-2 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">{t("name")}</dt>
                <dd className="font-display text-xl font-bold leading-tight">{member.fullName}</dd>
              </div>
              {member.memberNumber && (
                <div>
                  <dt className="text-xs uppercase tracking-wider text-muted-foreground">{t("memberNumber")}</dt>
                  <dd className="font-mono font-bold">{member.memberNumber}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">{t("municipality")}</dt>
                <dd className="font-semibold">{member.municipality}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">{t("rank")}</dt>
                <dd className="font-semibold">{tc(`enums.memberRank.${member.rank}` as "enums.memberRank.MILITANT")}</dd>
              </div>
              {card && (
                <div className="flex gap-6">
                  <div>
                    <dt className="text-xs uppercase tracking-wider text-muted-foreground">{t("issuedAt")}</dt>
                    <dd className="font-semibold">{formatDate(card.issuedAt, locale)}</dd>
                  </div>
                  {card.expiresAt && (
                    <div>
                      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{t("expiresAt")}</dt>
                      <dd className={cn("font-semibold", reason === "EXPIRED" && "text-red-700")}>{formatDate(card.expiresAt, locale)}</dd>
                    </div>
                  )}
                </div>
              )}
            </dl>
          </div>
        )}
      </section>
      {ok && <p className="mt-4 text-center text-sm text-muted-foreground">{t("note")}</p>}
      <p className="mt-2 text-center text-xs text-muted-foreground">{t("checkedAt", { date: formatDateTime(new Date(), locale) })}</p>
    </div>
  );
}
