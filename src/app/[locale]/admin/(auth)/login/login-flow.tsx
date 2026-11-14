"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { KeyRound, LockKeyhole, ShieldCheck, Smartphone } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { api, ApiClientError, errorMessage } from "@/lib/api-client";
import { formatTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-controls";
import { Alert, Skeleton } from "@/components/ui/primitives";

type Stage = "CREDENTIALS" | "TWO_FACTOR_REQUIRED" | "PASSWORD_CHANGE_REQUIRED" | "TWO_FACTOR_SETUP_REQUIRED" | "ACTIVE";

export function LoginFlow({ initialStage, next, email: initialEmail }: { initialStage: Stage; next: string; email?: string }) {
  const [stage, setStage] = useState<Stage>(initialStage);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (stage === "ACTIVE" && !recoveryCodes) {
      router.replace(next);
      router.refresh();
    }
  }, [stage, recoveryCodes, next, router]);

  if (recoveryCodes) return <RecoveryCodes codes={recoveryCodes} onDone={() => setRecoveryCodes(null)} />;

  switch (stage) {
    case "CREDENTIALS":
      return <Credentials initialEmail={initialEmail} onStage={setStage} />;
    case "TWO_FACTOR_REQUIRED":
      return <SecondFactor onStage={setStage} />;
    case "PASSWORD_CHANGE_REQUIRED":
      return <ChangePassword onStage={setStage} />;
    case "TWO_FACTOR_SETUP_REQUIRED":
      return <SetupTwoFactor onStage={setStage} onCodes={setRecoveryCodes} required />;
    default:
      return <Skeleton className="h-40" />;
  }
}

function StepTitle({ icon: Icon, title, subtitle }: { icon: React.ComponentType<{ className?: string }>; title: string; subtitle?: string }) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-pst-red">
        <Icon className="size-5" />
      </span>
      <div>
        <h1 className="text-xl font-extrabold uppercase leading-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
function Credentials({ initialEmail, onStage }: { initialEmail?: string; onStage: (s: Stage) => void }) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [email, setEmail] = useState(initialEmail ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ stage: Stage }>("/api/auth/login", { email, password });
      onStage(res.stage);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "INVALID_CREDENTIALS") setError(t("invalidCredentials"));
      else if (err instanceof ApiClientError && err.code === "ACCOUNT_LOCKED") {
        const until = (err.details as { lockedUntil?: string } | undefined)?.lockedUntil;
        setError(t("locked", { time: until ? formatTime(until, locale) : "—" }));
      } else setError(errorMessage(err, tc));
      setPassword("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <StepTitle icon={LockKeyhole} title={t("loginTitle")} subtitle={t("loginSubtitle")} />
      {error && <Alert variant="error">{error}</Alert>}
      <Field label={t("email")} htmlFor="email">
        <Input type="email" autoComplete="username" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label={t("password")} htmlFor="password">
        <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Button type="submit" className="w-full" size="lg" loading={loading} disabled={!email || !password}>
        {t("signIn")}
      </Button>
      <p className="text-center text-sm">
        <Link href="/admin/forgot-password" className="text-pst-red hover:underline">
          {t("forgot")}
        </Link>
      </p>
    </form>
  );
}

// -----------------------------------------------------------------------------
function SecondFactor({ onStage }: { onStage: (s: Stage) => void }) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const router = useRouter();
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ stage: Stage }>("/api/auth/2fa/verify", useRecovery ? { recoveryCode: code } : { code });
      onStage(res.stage);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "INVALID_2FA_CODE") setError(t("invalidCode"));
      else if (err instanceof ApiClientError && (err.code === "ACCOUNT_LOCKED" || err.status === 401)) {
        // Locked or session gone: back to the start.
        router.refresh();
        onStage("CREDENTIALS");
      } else setError(errorMessage(err, tc));
      setCode("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <StepTitle icon={Smartphone} title={t("twoFactorTitle")} subtitle={t("twoFactorHelp")} />
      {error && <Alert variant="error">{error}</Alert>}
      {useRecovery ? (
        <Field label={t("recoveryCode")} htmlFor="recovery">
          <Input autoComplete="off" autoCapitalize="characters" className="font-mono tracking-widest" value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXXX-XXXXX" />
        </Field>
      ) : (
        <Field label={t("code")} htmlFor="otp">
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            autoFocus
            className="h-14 text-center font-mono text-2xl tracking-[0.5em]"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
        </Field>
      )}
      <Button type="submit" className="w-full" size="lg" loading={loading} disabled={useRecovery ? code.length < 10 : code.length !== 6}>
        {t("verify")}
      </Button>
      <button type="button" className="w-full text-center text-sm text-pst-red hover:underline cursor-pointer" onClick={() => { setUseRecovery(!useRecovery); setCode(""); setError(null); }}>
        {useRecovery ? t("useAuthenticator") : t("useRecovery")}
      </button>
    </form>
  );
}

// -----------------------------------------------------------------------------
export function ChangePassword({ onStage, forced = true }: { onStage: (s: Stage) => void; forced?: boolean }) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [rules, setRules] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) return setError(t("passwordsDontMatch"));
    setLoading(true);
    setError(null);
    setRules([]);
    try {
      const res = await api.post<{ stage: Stage }>("/api/auth/password", { currentPassword: current, newPassword: next });
      onStage(res.stage);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "WEAK_PASSWORD") {
        setError(err.message);
        setRules(Array.isArray(err.details) ? (err.details as string[]) : []);
      } else setError(errorMessage(err, tc));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <StepTitle icon={KeyRound} title={t("changePasswordTitle")} subtitle={forced ? t("changePasswordForced") : undefined} />
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
      <Field label={t("currentPassword")} htmlFor="current">
        <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </Field>
      <Field label={t("newPassword")} htmlFor="new" hint={t("passwordRules")}>
        <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      </Field>
      <Field label={t("confirmPassword")} htmlFor="confirm" error={confirm && next !== confirm ? t("passwordsDontMatch") : null}>
        <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      <Button type="submit" className="w-full" size="lg" loading={loading} disabled={!current || next.length < 12 || next !== confirm}>
        {tc("actions.save")}
      </Button>
    </form>
  );
}

// -----------------------------------------------------------------------------
export function SetupTwoFactor({ onStage, onCodes, required }: { onStage: (s: Stage) => void; onCodes: (codes: string[]) => void; required?: boolean }) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const [setup, setSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get<{ secret: string; qrDataUrl: string }>("/api/auth/2fa/setup").then(setSetup).catch((err) => setError(errorMessage(err, tc)));
  }, [tc]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ stage: Stage; recoveryCodes: string[] }>("/api/auth/2fa/setup", { code });
      onCodes(res.recoveryCodes);
      onStage(res.stage);
    } catch (err) {
      setError(err instanceof ApiClientError && err.code === "INVALID_2FA_CODE" ? t("invalidCode") : errorMessage(err, tc));
      setCode("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <StepTitle icon={ShieldCheck} title={t("setup2faTitle")} subtitle={required ? t("setup2faRequired") : undefined} />
      {error && <Alert variant="error">{error}</Alert>}
      <ol className="space-y-4 text-sm">
        <li className="space-y-3">
          <p>
            <span className="font-bold text-pst-red">1.</span> {t("setup2faStep1")}
          </p>
          {setup ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={setup.qrDataUrl} alt="QR" width={200} height={200} />
              <p className="text-xs text-slate-500">{t("setup2faManual")}</p>
              <code className="break-all rounded bg-slate-100 px-2 py-1 text-center font-mono text-xs text-slate-900">{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</code>
            </div>
          ) : (
            <Skeleton className="mx-auto size-52" />
          )}
        </li>
        <li className="space-y-2">
          <p>
            <span className="font-bold text-pst-red">2.</span> {t("setup2faStep2")}
          </p>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            aria-label={t("code")}
            className="h-14 text-center font-mono text-2xl tracking-[0.5em]"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
        </li>
      </ol>
      <Button type="submit" className="w-full" size="lg" loading={loading} disabled={!setup || code.length !== 6}>
        {t("activate")}
      </Button>
    </form>
  );
}

// -----------------------------------------------------------------------------
export function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const [copied, setCopied] = useState(false);
  const text = codes.join("\n");

  return (
    <div className="space-y-4">
      <StepTitle icon={KeyRound} title={t("recoveryCodesTitle")} />
      <Alert variant="warning">{t("recoveryCodesHelp")}</Alert>
      <ul className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/50 p-3 font-mono text-sm">
        {codes.map((c) => (
          <li key={c} className="text-center">
            {c}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          }}
        >
          {copied ? tc("actions.copied") : tc("actions.copy")}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={() => {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([`PST Backoffice — recovery codes\n\n${text}\n`], { type: "text/plain" }));
            a.download = "pst-recovery-codes.txt";
            a.click();
          }}
        >
          {tc("actions.download")}
        </Button>
      </div>
      <Button className="w-full" size="lg" onClick={onDone}>
        {t("recoverySaved")}
      </Button>
    </div>
  );
}
