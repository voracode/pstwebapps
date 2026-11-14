"use client";

import { useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form-controls";
import { Alert } from "@/components/ui/primitives";
import { Turnstile } from "@/components/public/turnstile";
import { api, ApiClientError, errorMessage } from "@/lib/api-client";

const EMPTY = { name: "", email: "", phone: "", subject: "", message: "" };

export function ContactForm() {
  const t = useTranslations("public.contact");
  const tp = useTranslations("public.common");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [f, setF] = useState(EMPTY);
  const [website, setWebsite] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => {
    setF((s) => ({ ...s, [k]: e.target.value }));
    if (errors[k]) setErrors(({ [k]: _d, ...rest }) => rest);
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const e: Record<string, string> = {};
    if (f.name.trim().length < 2) e.name = f.name.trim() ? tp("minLength", { min: 2 }) : tp("required");
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = tp("invalidEmail");
    if (f.phone && !/^(\+|00)?\d{7,15}$/.test(f.phone.replace(/[\s\-().]/g, ""))) e.phone = tp("invalidPhone");
    if (!f.email.trim() && !f.phone.trim()) e.email = t("emailOrPhone");
    if (f.message.trim().length < 10) e.message = f.message.trim() ? tp("minLength", { min: 10 }) : tp("required");
    setErrors(e);
    if (Object.keys(e).length) return;

    setLoading(true);
    setError(null);
    try {
      await api.post("/api/contact", {
        name: f.name.trim(),
        email: f.email.trim() || undefined,
        phone: f.phone.trim() || undefined,
        subject: f.subject.trim() || undefined,
        message: f.message.trim(),
        locale,
        website,
        ...(token ? { turnstileToken: token } : {}),
      });
      setSent(true);
      setF(EMPTY);
    } catch (err) {
      setResetKey((k) => k + 1);
      if (err instanceof ApiClientError && Object.keys(err.fieldErrors).length) setErrors(err.fieldErrors);
      setError(errorMessage(err, tc));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-8 text-center shadow-sm" role="status">
        <CheckCircle2 className="size-12 text-green-600" aria-hidden />
        <h2 className="text-2xl font-extrabold uppercase">{t("successTitle")}</h2>
        <p className="text-muted-foreground">{t("successBody")}</p>
        <Button variant="outline" onClick={() => setSent(false)}>
          {t("another")}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4 rounded-xl border bg-card p-5 shadow-sm sm:p-8">
      <h2 className="text-2xl font-extrabold uppercase">{t("formTitle")}</h2>
      {error && <Alert variant="error">{error}</Alert>}
      <Field label={t("name")} htmlFor="c-name" required error={errors.name}>
        <Input value={f.name} onChange={set("name")} autoComplete="name" maxLength={160} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("email")} htmlFor="c-email" error={errors.email} hint={t("emailOrPhone")}>
          <Input type="email" value={f.email} onChange={set("email")} autoComplete="email" maxLength={160} />
        </Field>
        <Field label={t("phone")} htmlFor="c-phone" error={errors.phone}>
          <Input type="tel" inputMode="tel" value={f.phone} onChange={set("phone")} autoComplete="tel" maxLength={24} />
        </Field>
      </div>
      <Field label={`${t("subject")} (${tp("optional")})`} htmlFor="c-subject" error={errors.subject}>
        <Input value={f.subject} onChange={set("subject")} maxLength={220} />
      </Field>
      <Field label={t("message")} htmlFor="c-message" required error={errors.message}>
        <Textarea value={f.message} onChange={set("message")} rows={6} maxLength={5000} />
      </Field>
      {/* Honeypot: hidden from people and assistive tech, bots fill it. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="c-website">Website</label>
        <input id="c-website" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>
      <Turnstile onToken={setToken} resetKey={resetKey} />
      <Button type="submit" size="lg" loading={loading}>
        {!loading && <Send aria-hidden />}
        {loading ? tp("sending") : t("submit")}
      </Button>
    </form>
  );
}
