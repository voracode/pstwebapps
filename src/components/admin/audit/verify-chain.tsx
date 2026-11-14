"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { api, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/primitives";
import { formatNumber } from "@/lib/format";

interface Result {
  ok: boolean;
  checked: number;
  firstBrokenId?: string;
  reason?: string;
}

/** Recomputes the audit hash chain on the server and shows the outcome. */
export function VerifyChain() {
  const t = useTranslations("audit.verify");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.get<Result>("/api/admin/audit/verify"));
      // The verification itself is audited — show the new entry.
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, tc));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button variant="outline" onClick={run} loading={busy}>
        <ShieldCheck aria-hidden />
        {busy ? t("running") : t("button")}
      </Button>
      <div aria-live="polite">
        {result?.ok && (
          <Alert variant="success" title={t("okTitle")}>
            {t("ok", { count: result.checked, formatted: formatNumber(result.checked, locale) })}
          </Alert>
        )}
        {result && !result.ok && (
          <Alert variant="error" title={t("brokenTitle")}>
            <p>{t("broken", { id: result.firstBrokenId ?? "?", checked: formatNumber(result.checked, locale) })}</p>
            {result.reason && <p className="mt-1 font-mono text-xs">{result.reason}</p>}
            <p className="mt-1 inline-flex items-center gap-1 text-xs">
              <ShieldAlert className="size-3.5" aria-hidden />
              {t("brokenHint")}
            </p>
          </Alert>
        )}
        {error && <Alert variant="error">{error}</Alert>}
      </div>
    </div>
  );
}
