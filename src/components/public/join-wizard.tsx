"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight, Camera, Check, FileText, IdCard, MapPin, Pencil, Search, Send, User } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/form-controls";
import { Alert } from "@/components/ui/primitives";
import { Checkbox } from "@/components/ui/overlays";
import { GeoSelect, type GeoValue } from "@/components/shared/geo-select";
import { CopyButton } from "@/components/public/copy-button";
import { Turnstile } from "@/components/public/turnstile";
import { api, ApiClientError, errorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils/cn";

const GENDERS = ["MALE", "FEMALE"] as const;
const ID_TYPES = ["BILHETE_IDENTIDADE", "CARTAO_ELEITORAL", "PASSPORT", "OTHER"] as const;
const EDUCATION = ["NONE", "PRIMARY", "PRE_SECONDARY", "SECONDARY", "VOCATIONAL", "DIPLOMA", "BACHELOR", "MASTER", "DOCTORATE"] as const;

const PHOTO_MAX_MB = 5;
const SCAN_MAX_MB = 8;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const STEPS = [
  { key: "personal", icon: User, fields: ["fullName", "gender", "birthDate", "birthPlace", "phone", "email", "occupation", "educationLevel"] },
  { key: "identity", icon: IdCard, fields: ["idDocumentType", "idNumber"] },
  { key: "location", icon: MapPin, fields: ["municipalityId", "adminPostId", "sucoId", "aldeiaId", "addressLine"] },
  { key: "files", icon: Camera, fields: ["photo", "idScan"] },
  { key: "review", icon: Check, fields: ["motivation", "consent", "turnstileToken"] },
] as const;

type Text = {
  fullName: string;
  gender: string;
  birthDate: string;
  birthPlace: string;
  phone: string;
  email: string;
  occupation: string;
  educationLevel: string;
  idDocumentType: string;
  idNumber: string;
  addressLine: string;
  motivation: string;
};

const EMPTY: Text = {
  fullName: "",
  gender: "",
  birthDate: "",
  birthPlace: "",
  phone: "",
  email: "",
  occupation: "",
  educationLevel: "",
  idDocumentType: "BILHETE_IDENTIDADE",
  idNumber: "",
  addressLine: "",
  motivation: "",
};

function ageOn(birth: string): number | null {
  const d = new Date(`${birth}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--;
  return age;
}

function usePreview(file: File | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) return setUrl(null);
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url;
}

export function JoinWizard({ minAge, municipalities }: { minAge: number; municipalities: { id: number; name: string }[] }) {
  const t = useTranslations("public.join");
  const tp = useTranslations("public");
  const tc = useTranslations("common");
  const te = useTranslations("common.enums");
  const tg = useTranslations("common.geo");

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Text>(EMPTY);
  const [geo, setGeo] = useState<GeoValue>({});
  const [photo, setPhoto] = useState<File | null>(null);
  const [idScan, setIdScan] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ registrationRef: string } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const photoPreview = usePreview(photo);
  const scanPreview = usePreview(idScan);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step, result]);

  const set = (k: keyof Text) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    if (errors[k]) setErrors(({ [k]: _drop, ...rest }) => rest);
  };

  const validateStep = (i: number): Record<string, string> => {
    const e: Record<string, string> = {};
    const req = tp("common.required");
    if (i === 0) {
      if (form.fullName.trim().length < 3) e.fullName = form.fullName.trim() ? tp("common.minLength", { min: 3 }) : req;
      if (!form.gender) e.gender = req;
      if (!form.birthDate) e.birthDate = req;
      else {
        const age = ageOn(form.birthDate);
        if (age === null || age > 120) e.birthDate = tc("errors.validation");
        else if (age < minAge) e.birthDate = t("minAge", { age: minAge });
      }
      const digits = form.phone.replace(/[\s\-().]/g, "");
      if (!digits) e.phone = req;
      else if (!/^(\+|00)?\d{7,15}$/.test(digits)) e.phone = tp("common.invalidPhone");
      if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = tp("common.invalidEmail");
    }
    if (i === 1) {
      if (!form.idDocumentType) e.idDocumentType = req;
      const id = form.idNumber.trim();
      if (!id) e.idNumber = req;
      else if (id.length < 4 || id.length > 40 || !/^[A-Za-z0-9 .\-/]+$/.test(id)) e.idNumber = tc("errors.validation");
    }
    if (i === 2 && !geo.municipalityId) e.municipalityId = req;
    if (i === 3) {
      if (!photo) e.photo = req;
      if (!idScan) e.idScan = req;
    }
    if (i === 4 && !consent) e.consent = t("consentRequired");
    return e;
  };

  const focusFirstError = () =>
    requestAnimationFrame(() => (document.querySelector("form [aria-invalid=\"true\"]") as HTMLElement | null)?.focus());

  const next = () => {
    const e = validateStep(step);
    setErrors(e);
    if (Object.keys(e).length) focusFirstError();
    else {
      setFormError(null);
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }
  };

  const pickFile = (kind: "photo" | "idScan") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!file) return;
    const max = kind === "photo" ? PHOTO_MAX_MB : SCAN_MAX_MB;
    const okType = kind === "photo" ? IMAGE_TYPES.includes(file.type) : IMAGE_TYPES.includes(file.type) || file.type === "application/pdf";
    let err: string | null = null;
    if (!okType) err = t("fileType");
    else if (file.size > max * 1024 * 1024) err = t("fileTooLarge", { max });
    setErrors(({ [kind]: _drop, ...rest }) => (err ? { ...rest, [kind]: err } : rest));
    if (err) return;
    if (kind === "photo") setPhoto(file);
    else setIdScan(file);
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (step < STEPS.length - 1) return next();
    // Re-validate everything before sending.
    for (let i = 0; i < STEPS.length; i++) {
      const e = validateStep(i);
      if (Object.keys(e).length) {
        setErrors(e);
        setStep(i);
        return;
      }
    }
    const fd = new FormData();
    for (const [k, v] of Object.entries(form)) if (v.trim()) fd.set(k, v.trim());
    for (const [k, v] of Object.entries(geo)) if (v) fd.set(k, String(v));
    fd.set("consent", "true");
    if (token) fd.set("turnstileToken", token);
    fd.set("photo", photo!);
    fd.set("idScan", idScan!);

    setSubmitting(true);
    setFormError(null);
    try {
      const res = await api.post<{ registrationRef: string }>("/api/register", fd);
      setResult(res);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setResetKey((k) => k + 1);
      if (err instanceof ApiClientError) {
        if (err.status === 409) {
          setErrors({ idNumber: t("duplicate") });
          setFormError(t("duplicate"));
          setStep(1);
          return;
        }
        const fe = { ...err.fieldErrors };
        const det = err.details as { field?: string; minAge?: number } | undefined;
        if (det?.field === "birthDate" && det.minAge) fe.birthDate = t("minAge", { age: det.minAge });
        if (err.code === "FILE_TOO_LARGE") fe.photo = t("fileTooLarge", { max: (err.details as { maxMb?: number })?.maxMb ?? PHOTO_MAX_MB });
        if (Object.keys(fe).length) {
          setErrors(fe);
          const target = STEPS.findIndex((s) => s.fields.some((f) => f in fe));
          if (target >= 0) setStep(target);
          setFormError(t("fixErrors"));
          return;
        }
      }
      setFormError(errorMessage(err, tc));
    } finally {
      setSubmitting(false);
    }
  };

  const enumOptions = useMemo(
    () => ({
      gender: GENDERS.map((g) => ({ v: g, l: te(`gender.${g}`) })),
      idType: ID_TYPES.map((g) => ({ v: g, l: te(`idDocumentType.${g}`) })),
      education: EDUCATION.map((g) => ({ v: g, l: te(`educationLevel.${g}`) })),
    }),
    [te],
  );

  if (result) {
    return (
      <section className="mx-auto max-w-xl rounded-xl border bg-card p-6 text-center shadow-sm sm:p-10" aria-live="polite">
        <span className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-green-100 text-green-700">
          <Check className="size-8" aria-hidden strokeWidth={3} />
        </span>
        <h2 ref={headingRef} tabIndex={-1} className="text-3xl font-extrabold uppercase focus:outline-none">
          {t("successTitle")}
        </h2>
        <p className="mt-2 text-muted-foreground">{t("successBody")}</p>
        <div className="my-6 rounded-lg border-2 border-dashed border-pst-red bg-pst-red-50 p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-pst-red-800">{t("yourRef")}</p>
          <p className="mt-1 select-all font-mono text-3xl font-bold tracking-wider text-pst-ink sm:text-4xl">{result.registrationRef}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <CopyButton value={result.registrationRef} />
          <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
            {tp("common.print")}
          </Button>
          <Link href={`/membership-status?ref=${encodeURIComponent(result.registrationRef)}`} className={buttonVariants({ size: "sm" })}>
            <Search aria-hidden />
            {tp("home.checkStatus")}
          </Link>
        </div>
      </section>
    );
  }

  const current = STEPS[step]!;
  const fileBox = (kind: "photo" | "idScan", file: File | null, preview: string | null, label: string, hint: string, accept: string) => (
    <div className="space-y-2">
      <p className="text-sm font-medium" id={`${kind}-label`}>
        {label}
        <span className="ml-0.5 text-pst-red" aria-hidden>
          *
        </span>
      </p>
      <div className={cn("flex items-center gap-4 rounded-lg border-2 border-dashed p-4", errors[kind] ? "border-destructive" : "border-input")}>
        <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="size-full object-cover" />
          ) : file ? (
            <FileText className="size-10 text-pst-red" aria-hidden />
          ) : kind === "photo" ? (
            <User className="size-10 text-muted-foreground/50" aria-hidden />
          ) : (
            <IdCard className="size-10 text-muted-foreground/50" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          {file && <p className="truncate text-sm font-medium">{file.name}</p>}
          <label className={cn(buttonVariants({ variant: "outline", size: "sm" }), "focus-within:ring-2 focus-within:ring-ring/40")}>
            {file ? t("replace") : t("chooseFile")}
            <input
              type="file"
              accept={accept}
              className="sr-only"
              onChange={pickFile(kind)}
              aria-labelledby={`${kind}-label`}
              aria-describedby={`${kind}-hint`}
              aria-invalid={!!errors[kind] || undefined}
              {...(kind === "photo" ? { capture: "user" as const } : {})}
            />
          </label>
          <p id={`${kind}-hint`} className={cn("text-xs", errors[kind] ? "font-medium text-destructive" : "text-muted-foreground")}>
            {errors[kind] ?? hint}
          </p>
        </div>
      </div>
    </div>
  );

  const reviewRow = (label: string, value: ReactNode) => (
    <div className="grid grid-cols-[9rem_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium break-words">{value || "—"}</dd>
    </div>
  );

  return (
    <form onSubmit={submit} noValidate className="mx-auto max-w-3xl">
      <ol className="mb-8 grid grid-cols-5 gap-1" aria-label={t("stepOf", { current: step + 1, total: STEPS.length })}>
        {STEPS.map((s, i) => (
          <li key={s.key} className="flex flex-col items-center gap-1.5 text-center" aria-current={i === step ? "step" : undefined}>
            <span
              className={cn(
                "flex size-10 items-center justify-center rounded-full border-2 text-sm font-bold transition-colors",
                i < step ? "border-pst-red bg-pst-red text-white" : i === step ? "border-pst-red bg-white text-pst-red" : "border-border bg-muted text-muted-foreground",
              )}
            >
              {i < step ? <Check className="size-5" aria-hidden /> : <s.icon className="size-5" aria-hidden />}
            </span>
            <span className={cn("hidden text-xs font-semibold sm:block", i === step ? "text-foreground" : "text-muted-foreground")}>{t(`steps.${s.key}`)}</span>
          </li>
        ))}
      </ol>

      <div className="rounded-xl border bg-card p-5 shadow-sm sm:p-8">
        <p className="text-xs font-bold uppercase tracking-wider text-pst-red">{t("stepOf", { current: step + 1, total: STEPS.length })}</p>
        <h2 ref={headingRef} tabIndex={-1} className="mb-6 text-3xl font-extrabold uppercase focus:outline-none">
          {t(`steps.${current.key}`)}
        </h2>

        {formError && (
          <Alert variant="error" className="mb-6">
            {formError}
          </Alert>
        )}

        {current.key === "personal" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("fullName")} htmlFor="fullName" required hint={t("fullNameHint")} error={errors.fullName} className="sm:col-span-2">
              <Input value={form.fullName} onChange={set("fullName")} autoComplete="name" maxLength={180} />
            </Field>
            <Field label={t("gender")} htmlFor="gender" required error={errors.gender}>
              <NativeSelect value={form.gender} onChange={set("gender")}>
                <option value="">{tp("common.selectPlaceholder")}</option>
                {enumOptions.gender.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.l}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t("birthDate")} htmlFor="birthDate" required error={errors.birthDate} hint={t("minAge", { age: minAge })}>
              <Input type="date" value={form.birthDate} onChange={set("birthDate")} autoComplete="bday" max={new Date().toISOString().slice(0, 10)} />
            </Field>
            <Field label={t("birthPlace")} htmlFor="birthPlace" error={errors.birthPlace}>
              <Input value={form.birthPlace} onChange={set("birthPlace")} maxLength={120} />
            </Field>
            <Field label={t("phone")} htmlFor="phone" required hint={t("phoneHint")} error={errors.phone}>
              <Input type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" maxLength={24} />
            </Field>
            <Field label={`${t("email")} (${tp("common.optional")})`} htmlFor="email" error={errors.email}>
              <Input type="email" value={form.email} onChange={set("email")} autoComplete="email" maxLength={160} />
            </Field>
            <Field label={t("occupation")} htmlFor="occupation" error={errors.occupation}>
              <Input value={form.occupation} onChange={set("occupation")} autoComplete="organization-title" maxLength={160} />
            </Field>
            <Field label={t("education")} htmlFor="educationLevel" error={errors.educationLevel} className="sm:col-span-2">
              <NativeSelect value={form.educationLevel} onChange={set("educationLevel")}>
                <option value="">{tp("common.selectPlaceholder")}</option>
                {enumOptions.education.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.l}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
        )}

        {current.key === "identity" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("idType")} htmlFor="idDocumentType" required error={errors.idDocumentType}>
              <NativeSelect value={form.idDocumentType} onChange={set("idDocumentType")}>
                {enumOptions.idType.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.l}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t("idNumber")} htmlFor="idNumber" required hint={t("idNumberHint")} error={errors.idNumber}>
              <Input value={form.idNumber} onChange={set("idNumber")} autoComplete="off" maxLength={40} spellCheck={false} />
            </Field>
          </div>
        )}

        {current.key === "location" && (
          <div className="space-y-4">
            <GeoSelect
              value={geo}
              onChange={(v) => {
                setGeo(v);
                if (errors.municipalityId && v.municipalityId) setErrors(({ municipalityId: _d, ...rest }) => rest);
              }}
              required
              errors={{ municipalityId: errors.municipalityId, adminPostId: errors.adminPostId, sucoId: errors.sucoId, aldeiaId: errors.aldeiaId }}
            />
            <Field label={t("address")} htmlFor="addressLine" hint={t("addressHint")} error={errors.addressLine}>
              <Input value={form.addressLine} onChange={set("addressLine")} autoComplete="street-address" maxLength={255} />
            </Field>
          </div>
        )}

        {current.key === "files" && (
          <div className="grid gap-6 md:grid-cols-2">
            {fileBox("photo", photo, photoPreview, t("photo"), t("photoHint", { max: PHOTO_MAX_MB }), IMAGE_TYPES.join(","))}
            {fileBox("idScan", idScan, scanPreview, t("idScan"), t("idScanHint", { max: SCAN_MAX_MB }), [...IMAGE_TYPES, "application/pdf"].join(","))}
          </div>
        )}

        {current.key === "review" && (
          <div className="space-y-6">
            {(
              [
                [0, [
                  [t("fullName"), form.fullName],
                  [t("gender"), form.gender && te(`gender.${form.gender}`)],
                  [t("birthDate"), form.birthDate],
                  [t("birthPlace"), form.birthPlace],
                  [t("phone"), form.phone],
                  [t("email"), form.email],
                  [t("occupation"), form.occupation],
                  [t("education"), form.educationLevel && te(`educationLevel.${form.educationLevel}`)],
                ]],
                [1, [
                  [t("idType"), te(`idDocumentType.${form.idDocumentType}`)],
                  [t("idNumber"), form.idNumber.length > 4 ? `•••• ${form.idNumber.slice(-4)}` : form.idNumber],
                ]],
                [2, [
                  [tg("municipality"), municipalities.find((m) => m.id === geo.municipalityId)?.name],
                  [t("address"), form.addressLine],
                ]],
                [3, [
                  [t("photo"), photo?.name],
                  [t("idScan"), idScan?.name],
                ]],
              ] as [number, [string, string | undefined][]][]
            ).map(([i, rows]) => (
              <section key={i} className="rounded-lg border p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="font-display text-lg font-bold">{t(`steps.${STEPS[i]!.key}`)}</h3>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setStep(i)}>
                    <Pencil aria-hidden />
                    {t("edit")}
                  </Button>
                </div>
                <dl className="divide-y">{rows.map(([l, v]) => <div key={l}>{reviewRow(l, v)}</div>)}</dl>
              </section>
            ))}
            <Field label={`${t("motivation")} (${tp("common.optional")})`} htmlFor="motivation" error={errors.motivation}>
              <Textarea value={form.motivation} onChange={set("motivation")} maxLength={2000} rows={4} />
            </Field>
            <div className="space-y-1.5">
              <div className="flex items-start gap-3 rounded-lg bg-surface p-4">
                <Checkbox
                  id="consent"
                  checked={consent}
                  onCheckedChange={(v) => {
                    setConsent(v === true);
                    if (v === true) setErrors(({ consent: _d, ...rest }) => rest);
                  }}
                  aria-invalid={!!errors.consent || undefined}
                  aria-describedby={errors.consent ? "consent-error" : undefined}
                  className="mt-0.5"
                />
                <label htmlFor="consent" className="text-sm leading-relaxed">
                  {t("consent")}
                  <span className="ml-0.5 text-pst-red" aria-hidden>
                    *
                  </span>
                </label>
              </div>
              {errors.consent && (
                <p id="consent-error" className="text-xs font-medium text-destructive">
                  {errors.consent}
                </p>
              )}
            </div>
            <Turnstile onToken={setToken} resetKey={resetKey} />
            {errors.turnstileToken && <p className="text-xs font-medium text-destructive">{errors.turnstileToken}</p>}
          </div>
        )}

        <div className="mt-8 flex items-center justify-between gap-3 border-t pt-6">
          {step > 0 ? (
            <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)} disabled={submitting}>
              <ArrowLeft aria-hidden />
              {tc("actions.back")}
            </Button>
          ) : (
            <span />
          )}
          {step < STEPS.length - 1 ? (
            <Button type="submit">
              {tc("actions.next")}
              <ArrowRight aria-hidden />
            </Button>
          ) : (
            <Button type="submit" loading={submitting} size="lg">
              {!submitting && <Send aria-hidden />}
              {submitting ? tp("common.sending") : t("submit")}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
