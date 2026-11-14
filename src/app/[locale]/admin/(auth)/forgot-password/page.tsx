"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { api, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-controls";
import { Alert } from "@/components/ui/primitives";

export default function ForgotPasswordPage() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post("/api/auth/password/forgot", { email });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err, tc));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold uppercase">{t("forgotTitle")}</h1>
      {sent ? (
        <Alert variant="success">{t("linkSent")}</Alert>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("forgotHelp")}</p>
          {error && <Alert variant="error">{error}</Alert>}
          <Field label={t("email")} htmlFor="email">
            <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Button type="submit" className="w-full" loading={loading} disabled={!email}>
            {t("sendLink")}
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
