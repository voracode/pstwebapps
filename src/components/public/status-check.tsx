"use client";

import { useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BadgeCheck, Clock, Search, ShieldOff, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-controls";
import { Alert, Badge } from "@/components/ui/primitives";
import { api, ApiClientError, errorMessage } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils/cn";

type Status = "PENDING" | "VERIFIED" | "REJECTED" | "SUSPENDED";
interface Result {
  status: Status;
  memberNumber: string | null;
  fullName: string;
  municipality: string;
  submittedAt: string;
  verifiedAt: string | null;
}

const STYLE: Record<Status, { icon: typeof Clock; ring: string; badge: "warning" | "success" | "danger" | "muted" }> = {
  PENDING: { icon: Clock, ring: "border-amber-300 bg-amber-50", badge: "warning" },
  VERIFIED: { icon: BadgeCheck, ring: "border-green-300 bg-green-50", badge: "success" },
  REJECTED: { icon: XCircle, ring: "border-red-300 bg-red-50", badge: "danger" },
  SUSPENDED: { icon: ShieldOff, ring: "border-slate-300 bg-slate-50", badge: "muted" },
};

const REF_RE = /^REG-[0-9A-Z]{8}$/;

export function StatusCheck({ initialRef }: { initialRef?: string }) {
  const t = useTranslations("public.status");
  const tp = useTranslations("public.common");
  const tj = useTranslations("public.join");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [ref, setRef] = useState(initialRef ?? "");
  const [birthDate, setBirthDate] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const registrationRef = ref.trim().toUpperCase();
    const errs: Record<string, string> = {};
    if (!registrationRef) errs.registrationRef = tp("required");
    else if (!REF_RE.test(registrationRef)) errs.registrationRef = t("invalidRef");
    if (!birthDate) errs.birthDate = tp("required");
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.post<Result>("/api/membership/status", { registrationRef, birthDate }));
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 404) setError(t("notFound"));
      else if (err instanceof ApiClientError && Object.keys(err.fieldErrors).length) setErrors(err.fieldErrors);
      else setError(errorMessage(err, tc));
    } finally {
      setLoading(false);
    }
  };

  const s = result ? STYLE[result.status] : null;

  return (
    <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-[1fr_1.1fr]">
      <form onSubmit={submit} noValidate className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <Field label={t("ref")} htmlFor="registrationRef" required hint={t("refHint")} error={errors.registrationRef}>
          <Input
            value={ref}
            onChange={(e) => setRef(e.target.value.toUpperCase())}
            placeholder="REG-XXXXXXXX"
            autoComplete="off"
            spellCheck={false}
            maxLength={12}
            className="font-mono uppercase tracking-wider"
          />
        </Field>
        <Field label={tj("birthDate")} htmlFor="birthDate" required error={errors.birthDate}>
          <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} autoComplete="bday" />
        </Field>
        <Button type="submit" loading={loading} className="w-full">
          {!loading && <Search aria-hidden />}
          {t("check")}
        </Button>
        {error && <Alert variant="error">{error}</Alert>}
      </form>

      <div aria-live="polite">
        {result && s && (
          <section className={cn("rounded-xl border-2 p-6", s.ring)}>
            <div className="mb-4 flex items-center gap-3">
              <s.icon className="size-10 shrink-0 text-pst-ink" aria-hidden />
              <div>
                <Badge variant={s.badge}>{tc(`enums.memberStatus.${result.status}`)}</Badge>
                <p className="mt-1 font-display text-2xl font-bold leading-tight text-pst-ink">{result.fullName}</p>
              </div>
            </div>
            <p className="mb-4 text-sm text-pst-ink">{t(result.status)}</p>
            <dl className="space-y-2 text-sm text-pst-ink">
              {result.memberNumber && (
                <div className="flex justify-between gap-3 border-t border-black/10 pt-2">
                  <dt className="text-slate-600">{t("memberNumber")}</dt>
                  <dd className="font-mono font-bold">{result.memberNumber}</dd>
                </div>
              )}
              <div className="flex justify-between gap-3 border-t border-black/10 pt-2">
                <dt className="text-slate-600">{tc("geo.municipality")}</dt>
                <dd className="font-semibold">{result.municipality}</dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-black/10 pt-2">
                <dt className="text-slate-600">{t("submittedAt")}</dt>
                <dd className="font-semibold">{formatDate(result.submittedAt, locale)}</dd>
              </div>
              {result.verifiedAt && (
                <div className="flex justify-between gap-3 border-t border-black/10 pt-2">
                  <dt className="text-slate-600">{t("verifiedAt")}</dt>
                  <dd className="font-semibold">{formatDate(result.verifiedAt, locale)}</dd>
                </div>
              )}
            </dl>
          </section>
        )}
      </div>
    </div>
  );
}
