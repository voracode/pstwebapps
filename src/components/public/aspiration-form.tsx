"use client";

import { useRef, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, FileText, Paperclip, Printer, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/form-controls";
import { Alert } from "@/components/ui/primitives";
import { Switch } from "@/components/ui/overlays";
import { GeoSelect, type GeoValue } from "@/components/shared/geo-select";
import { CopyButton } from "@/components/public/copy-button";
import { Turnstile } from "@/components/public/turnstile";
import { api, ApiClientError, errorMessage } from "@/lib/api-client";
import { formatBytes } from "@/lib/format";

const CATEGORIES = [
  "LAND_PROPERTY",
  "AGRICULTURE_FISHERIES",
  "LABOUR_EMPLOYMENT",
  "EDUCATION",
  "HEALTH",
  "INFRASTRUCTURE",
  "WATER_SANITATION",
  "ELECTRICITY",
  "SOCIAL_PROTECTION",
  "CORRUPTION_GOVERNANCE",
  "YOUTH",
  "WOMEN_GENDER",
  "VETERANS",
  "OTHER",
] as const;
const SUBMITTERS = ["CITIZEN", "WORKER", "FARMER", "FISHER", "STUDENT", "VETERAN", "PARTY_MEMBER", "OTHER"] as const;
const MAX_FILES = 3;
const MAX_MB = 8;
const ACCEPT = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

type Ticket = { ticketNumber: string; trackingCode: string; status: string };

export function AspirationForm() {
  const t = useTranslations("public.voice");
  const tp = useTranslations("public.common");
  const tj = useTranslations("public.join");
  const tc = useTranslations("common");
  const te = useTranslations("common.enums");
  const locale = useLocale();

  const [f, setF] = useState({ category: "", submitterType: "CITIZEN", name: "", phone: "", email: "", subject: "", message: "" });
  const [anonymous, setAnonymous] = useState(false);
  const [geo, setGeo] = useState<GeoValue>({});
  const [files, setFiles] = useState<File[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => {
    setF((s) => ({ ...s, [k]: e.target.value }));
    if (errors[k]) setErrors(({ [k]: _d, ...rest }) => rest);
  };

  const addFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    let err: string | null = null;
    const ok: File[] = [];
    for (const file of picked) {
      if (!ACCEPT.includes(file.type)) err = tj("fileType");
      else if (file.size > MAX_MB * 1024 * 1024) err = tj("fileTooLarge", { max: MAX_MB });
      else ok.push(file);
    }
    const next = [...files, ...ok];
    if (next.length > MAX_FILES) err = t("tooManyFiles", { count: MAX_FILES });
    setFiles(next.slice(0, MAX_FILES));
    setErrors(({ attachments: _d, ...rest }) => (err ? { ...rest, attachments: err } : rest));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    const req = tp("required");
    if (!f.category) e.category = req;
    if (!anonymous && !f.name.trim()) e.name = t("nameRequired");
    if (!anonymous && f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = tp("invalidEmail");
    if (!anonymous && f.phone && !/^(\+|00)?\d{7,15}$/.test(f.phone.replace(/[\s\-().]/g, ""))) e.phone = tp("invalidPhone");
    if (f.subject.trim().length < 5) e.subject = f.subject.trim() ? tp("minLength", { min: 5 }) : req;
    if (f.message.trim().length < 20) e.message = f.message.trim() ? tp("minLength", { min: 20 }) : req;
    return e;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      setFormError(tc("errors.validation"));
      return;
    }
    const fd = new FormData();
    fd.set("category", f.category);
    fd.set("submitterType", f.submitterType);
    fd.set("isAnonymous", anonymous ? "true" : "false");
    if (!anonymous) {
      if (f.name.trim()) fd.set("name", f.name.trim());
      if (f.phone.trim()) fd.set("phone", f.phone.trim());
      if (f.email.trim()) fd.set("email", f.email.trim());
    }
    if (geo.municipalityId) fd.set("municipalityId", String(geo.municipalityId));
    if (geo.municipalityId && geo.sucoId) fd.set("sucoId", String(geo.sucoId));
    fd.set("subject", f.subject.trim());
    fd.set("message", f.message.trim());
    fd.set("locale", locale);
    if (token) fd.set("turnstileToken", token);
    for (const file of files) fd.append("attachments", file);

    setLoading(true);
    setFormError(null);
    try {
      setTicket(await api.post<Ticket>("/api/aspirations", fd));
      requestAnimationFrame(() => resultRef.current?.focus());
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setResetKey((k) => k + 1);
      if (err instanceof ApiClientError && Object.keys(err.fieldErrors).length) {
        setErrors(err.fieldErrors);
        setFormError(tc("errors.validation"));
      } else setFormError(errorMessage(err, tc));
    } finally {
      setLoading(false);
    }
  };

  if (ticket) {
    return (
      <section className="rounded-xl border bg-card p-6 shadow-sm print:border-0 print:shadow-none sm:p-8" aria-live="polite">
        <div className="mb-5 flex items-center gap-3">
          <CheckCircle2 className="size-10 shrink-0 text-green-600" aria-hidden />
          <h2 ref={resultRef} tabIndex={-1} className="text-2xl font-extrabold uppercase focus:outline-none">
            {t("successTitle")}
          </h2>
        </div>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg bg-surface p-4">
            <dt className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("ticketNumber")}</dt>
            <dd className="mt-1 select-all font-mono text-2xl font-bold">{ticket.ticketNumber}</dd>
          </div>
          <div className="rounded-lg border-2 border-dashed border-pst-red bg-pst-red-50 p-4">
            <dt className="text-xs font-bold uppercase tracking-wider text-pst-red-800">{t("trackingCode")}</dt>
            <dd className="mt-1 select-all font-mono text-2xl font-bold text-pst-ink">{ticket.trackingCode}</dd>
          </div>
        </dl>
        <div className="mt-5 flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p className="font-medium">{t("warning")}</p>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 print:hidden">
          <CopyButton value={`${t("ticketNumber")}: ${ticket.ticketNumber}\n${t("trackingCode")}: ${ticket.trackingCode}`} />
          <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
            <Printer aria-hidden />
            {tp("print")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setTicket(null);
              setF({ category: "", submitterType: "CITIZEN", name: "", phone: "", email: "", subject: "", message: "" });
              setFiles([]);
              setGeo({});
            }}
          >
            {t("another")}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5 rounded-xl border bg-card p-5 shadow-sm sm:p-8">
      <h2 className="text-2xl font-extrabold uppercase">{t("formTitle")}</h2>
      {formError && <Alert variant="error">{formError}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("category")} htmlFor="category" required error={errors.category}>
          <NativeSelect value={f.category} onChange={set("category")}>
            <option value="">{tp("selectPlaceholder")}</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {te(`aspirationCategory.${c}`)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t("submitterType")} htmlFor="submitterType" error={errors.submitterType}>
          <NativeSelect value={f.submitterType} onChange={set("submitterType")}>
            {SUBMITTERS.map((c) => (
              <option key={c} value={c}>
                {te(`submitterType.${c}`)}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <div className="flex items-start justify-between gap-4 rounded-lg bg-surface p-4">
        <div>
          <label htmlFor="anonymous" className="font-semibold">
            {t("anonymous")}
          </label>
          <p id="anonymous-hint" className="text-sm text-muted-foreground">
            {t("anonymousHint")}
          </p>
        </div>
        <Switch id="anonymous" checked={anonymous} onCheckedChange={setAnonymous} aria-describedby="anonymous-hint" />
      </div>

      {!anonymous && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("name")} htmlFor="name" required error={errors.name} className="sm:col-span-3">
            <Input value={f.name} onChange={set("name")} autoComplete="name" maxLength={180} />
          </Field>
          <Field label={`${t("phone")} (${tp("optional")})`} htmlFor="phone" error={errors.phone}>
            <Input type="tel" inputMode="tel" value={f.phone} onChange={set("phone")} autoComplete="tel" maxLength={24} />
          </Field>
          <Field label={`${t("email")} (${tp("optional")})`} htmlFor="email" error={errors.email} className="sm:col-span-2">
            <Input type="email" value={f.email} onChange={set("email")} autoComplete="email" maxLength={160} />
          </Field>
        </div>
      )}

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold">{t("location")}</legend>
        <GeoSelect value={geo} onChange={setGeo} levels="suco" errors={{ municipalityId: errors.municipalityId, sucoId: errors.sucoId }} />
      </fieldset>

      <Field label={t("subject")} htmlFor="subject" required error={errors.subject}>
        <Input value={f.subject} onChange={set("subject")} maxLength={220} />
      </Field>
      <Field label={t("message")} htmlFor="message" required hint={`${t("messageHint")} (${f.message.length}/5000)`} error={errors.message}>
        <Textarea value={f.message} onChange={set("message")} rows={7} maxLength={5000} />
      </Field>

      <div className="space-y-2">
        <p className="text-sm font-medium" id="att-label">
          {t("attachments")} <span className="font-normal text-muted-foreground">({tp("optional")})</span>
        </p>
        {files.length > 0 && (
          <ul className="space-y-1.5">
            {files.map((file, i) => (
              <li key={`${file.name}-${i}`} className="flex items-center gap-2 rounded-md border bg-surface px-3 py-2 text-sm">
                <FileText className="size-4 shrink-0 text-pst-red" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(file.size)}</span>
                <button
                  type="button"
                  onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))}
                  className="rounded p-1 hover:bg-muted"
                  aria-label={`${tc("actions.delete")}: ${file.name}`}
                >
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        {files.length < MAX_FILES && (
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-semibold hover:bg-muted focus-within:ring-2 focus-within:ring-ring/40">
            <Paperclip className="size-4" aria-hidden />
            {tc("actions.add")}
            <input type="file" multiple accept={ACCEPT.join(",")} className="sr-only" onChange={addFiles} aria-labelledby="att-label" aria-describedby="att-hint" />
          </label>
        )}
        <p id="att-hint" className={errors.attachments ? "text-xs font-medium text-destructive" : "text-xs text-muted-foreground"}>
          {errors.attachments ?? t("attachmentsHint", { count: MAX_FILES, max: MAX_MB })}
        </p>
      </div>

      <Turnstile onToken={setToken} resetKey={resetKey} />

      <Button type="submit" size="lg" loading={loading} className="w-full sm:w-auto">
        {!loading && <Send aria-hidden />}
        {loading ? tp("sending") : t("submit")}
      </Button>
    </form>
  );
}
