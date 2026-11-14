"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { api, ApiClientError, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-controls";
import { Alert } from "@/components/ui/primitives";

/** Target of password-reset and invitation e-mails (?token=…). */
export default function ResetPasswordPage() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(token.length < 20 ? t("invalidLink") : null);
  const [rules, setRules] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setRules([]);
    try {
      await api.post("/api/auth/password/reset", { token, newPassword: password });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "INVALID_TOKEN") setError(t("invalidLink"));
      else if (err instanceof ApiClientError && (err.code === "WEAK_PASSWORD" || err.code === "PASSWORD_REUSED")) {
        setError(err.message);
        setRules(Array.isArray(err.details) ? (err.details as string[]) : []);
      } else setError(errorMessage(err, tc));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold uppercase">{t("resetTitle")}</h1>
      {done ? (
        <Alert variant="success">{t("resetDone")}</Alert>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && (
            <Alert variant="error" title={error}>
              {rules.length > 0 && (
                <ul className="list-disc pl-4">
                  {rules.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}
            </Alert>
          )}
          <Field label={t("newPassword")} htmlFor="new" hint={t("passwordRules")}>
            <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label={t("confirmPassword")} htmlFor="confirm" error={confirm && confirm !== password ? t("passwordsDontMatch") : null}>
            <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <Button type="submit" className="w-full" loading={loading} disabled={token.length < 20 || password.length < 12 || password !== confirm}>
            {tc("actions.save")}
          </Button>
        </form>
      )}
      <p className="text-center text-sm">
        <Link href="/admin/login" className="text-pst-red hover:underline">
          {t("backToLogin")}
        </Link>
      </p>
    </div>
  );
}
