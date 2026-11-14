"use client";

import { useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, MessageSquareText, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-controls";
import { Alert, Badge } from "@/components/ui/primitives";
import { api, ApiClientError, errorMessage } from "@/lib/api-client";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils/cn";

interface Tracked {
  ticketNumber: string;
  status: string;
  category: string;
  subject: string;
  submittedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  replies: { body: string; createdAt: string }[];
}

const FLOW = ["NEW", "ACKNOWLEDGED", "IN_REVIEW", "FORWARDED", "RESOLVED", "CLOSED"] as const;
const TICKET_RE = /^ASP-\d{4}-[0-9A-Z]{6}$/;

export function AspirationTracker({ initialTicket }: { initialTicket?: string }) {
  const t = useTranslations("public.voice");
  const tp = useTranslations("public.common");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [ticketNumber, setTicketNumber] = useState(initialTicket ?? "");
  const [trackingCode, setTrackingCode] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Tracked | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const tn = ticketNumber.trim().toUpperCase();
    const code = trackingCode.trim().toUpperCase();
    const errs: Record<string, string> = {};
    if (!TICKET_RE.test(tn)) errs.ticketNumber = tn ? tc("errors.validation") : tp("required");
    if (code.length < 12) errs.trackingCode = code ? tc("errors.validation") : tp("required");
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      setData(await api.post<Tracked>("/api/aspirations/track", { ticketNumber: tn, trackingCode: code }));
    } catch (err) {
      setError(err instanceof ApiClientError && (err.status === 404 || err.code === "VALIDATION_ERROR") ? t("notFound") : errorMessage(err, tc));
    } finally {
      setLoading(false);
    }
  };

  const reached = data ? FLOW.indexOf(data.status as (typeof FLOW)[number]) : -1;
  const dateFor = (s: string) =>
    data && (s === "NEW" ? data.submittedAt : s === "ACKNOWLEDGED" ? data.acknowledgedAt : s === "RESOLVED" ? data.resolvedAt : null);

  return (
    <section id="track" aria-labelledby="track-h" className="scroll-mt-24 rounded-xl border bg-surface p-5 sm:p-6">
      <h2 id="track-h" className="text-2xl font-extrabold uppercase">
        {t("trackTitle")}
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">{t("trackLead")}</p>
      <form onSubmit={submit} noValidate className="space-y-3">
        <Field label={t("ticketNumber")} htmlFor="ticketNumber" required error={errors.ticketNumber}>
          <Input
            value={ticketNumber}
            onChange={(e) => setTicketNumber(e.target.value.toUpperCase())}
            placeholder="ASP-2026-XXXXXX"
            className="font-mono uppercase"
            autoComplete="off"
            spellCheck={false}
            maxLength={16}
          />
        </Field>
        <Field label={t("trackingCode")} htmlFor="trackingCode" required error={errors.trackingCode}>
          <Input
            value={trackingCode}
            onChange={(e) => setTrackingCode(e.target.value.toUpperCase())}
            placeholder="XXXX-XXXX-XXXX"
            className="font-mono uppercase"
            autoComplete="off"
            spellCheck={false}
            maxLength={20}
          />
        </Field>
        <Button type="submit" loading={loading} className="w-full">
          {!loading && <Search aria-hidden />}
          {t("track")}
        </Button>
      </form>
      {error && (
        <Alert variant="error" className="mt-4">
          {error}
        </Alert>
      )}

      {data && (
        <div className="mt-6 space-y-5" aria-live="polite">
          <div className="rounded-lg border bg-card p-4">
            <p className="font-mono text-sm text-muted-foreground">{data.ticketNumber}</p>
            <p className="font-display text-lg font-bold leading-tight">{data.subject}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="outline">{tc(`enums.aspirationCategory.${data.category}`)}</Badge>
              <Badge variant={data.status === "RESOLVED" || data.status === "CLOSED" ? "success" : "info"}>
                {t("status")}: {tc(`enums.ticketStatus.${data.status}`)}
              </Badge>
            </div>
          </div>

          <ol className="relative ml-3 space-y-4 border-l-2 border-border pl-6">
            {FLOW.map((s, i) => {
              const done = i <= reached;
              const d = dateFor(s);
              return (
                <li key={s} className="relative">
                  <span
                    className={cn(
                      "absolute -left-[2.15rem] top-0 flex size-6 items-center justify-center rounded-full border-2",
                      done ? "border-pst-red bg-pst-red text-white" : "border-border bg-background",
                    )}
                    aria-hidden
                  >
                    {done && <Check className="size-3.5" strokeWidth={3} />}
                  </span>
                  <p className={cn("text-sm font-semibold", !done && "text-muted-foreground")}>
                    {tc(`enums.ticketStatus.${s}`)}
                    {i === reached && <span className="sr-only"> ({t("status")})</span>}
                  </p>
                  {d && <p className="text-xs text-muted-foreground">{formatDate(d, locale)}</p>}
                </li>
              );
            })}
          </ol>

          <div>
            <h3 className="mb-2 flex items-center gap-2 font-display text-lg font-bold">
              <MessageSquareText className="size-5 text-pst-red" aria-hidden />
              {t("replies")}
            </h3>
            {data.replies.length > 0 ? (
              <ul className="space-y-3">
                {data.replies.map((r, i) => (
                  <li key={i} className="rounded-lg border-l-4 border-pst-red bg-card p-3 shadow-sm">
                    <p className="whitespace-pre-line text-sm">{r.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(r.createdAt, locale)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("noReplies")}</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
