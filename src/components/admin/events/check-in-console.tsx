"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Camera, CameraOff, CheckCircle2, Hash, UserPlus, XCircle } from "lucide-react";
import type QrScannerType from "qr-scanner";
import { useRouter } from "@/i18n/navigation";
import { api, ApiClientError, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect } from "@/components/ui/form-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { cn } from "@/lib/utils/cn";

type Mode = "scan" | "number" | "guest";
type Payload = { qrToken: string } | { memberNumber: string } | { guestName: string; guestPhone?: string; guestGender?: string };
type MemberInfo = { fullName: string; memberNumber: string | null; status: string } | null;
type Result = { tone: "ok" | "warn" | "error"; title: string; name?: string; detail?: string; at: number };

const KTA_RE = /^PST-[A-Z]{2}-\d{4}-\d{6}$/;

/** QR content → attendance payload. The KTA QR encodes `<KTA_VERIFY_URL>/<token>`. */
export function parseScan(raw: string): Payload | null {
  const s = raw.trim();
  if (KTA_RE.test(s.toUpperCase())) return { memberNumber: s.toUpperCase() };
  const m = /\/verify\/([A-Za-z0-9_-]{20,64})\/?(?:[?#].*)?$/.exec(s);
  if (m) return { qrToken: m[1]! };
  if (/^[A-Za-z0-9_-]{20,64}$/.test(s)) return { qrToken: s };
  return null;
}

export function CheckInConsole({ eventId }: { eventId: string }) {
  const t = useTranslations("events.checkin");
  const tc = useTranslations("common");
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("scan");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const lastScan = useRef<{ value: string; at: number }>({ value: "", at: 0 });

  const [number, setNumber] = useState("");
  const [guest, setGuest] = useState({ name: "", phone: "", gender: "" });
  const [guestError, setGuestError] = useState<string | null>(null);
  const [numberError, setNumberError] = useState<string | null>(null);

  const statusLabel = useCallback((s: string) => tc(`enums.memberStatus.${s as "PENDING"}`), [tc]);

  const submit = useCallback(
    async (payload: Payload): Promise<boolean> => {
      if (busyRef.current) return false;
      busyRef.current = true;
      setBusy(true);
      try {
        const res = await api.post<{ member: MemberInfo; warning?: string }>(`/api/admin/events/${eventId}/attendance`, payload);
        const mem = res.member;
        if (mem && mem.status !== "VERIFIED") {
          setResult({ tone: "warn", title: t("result.warnStatus", { status: statusLabel(mem.status) }), name: mem.fullName, detail: mem.memberNumber ?? undefined, at: Date.now() });
        } else if (mem) {
          setResult({ tone: "ok", title: t("result.ok"), name: mem.fullName, detail: mem.memberNumber ?? undefined, at: Date.now() });
        } else {
          setResult({ tone: "ok", title: t("result.guestOk"), name: "guestName" in payload ? payload.guestName : undefined, at: Date.now() });
        }
        if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(80);
        router.refresh();
        return true;
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 409) {
          const mem = (err.details as { member?: MemberInfo } | undefined)?.member ?? null;
          setResult({ tone: "warn", title: t("result.already"), name: mem?.fullName, detail: mem?.memberNumber ?? undefined, at: Date.now() });
        } else if (err instanceof ApiClientError && err.status === 404) {
          setResult({ tone: "error", title: t("result.notFound"), detail: t("result.notFoundHint"), at: Date.now() });
        } else {
          setResult({ tone: "error", title: errorMessage(err, tc), at: Date.now() });
        }
        if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.([60, 60, 60]);
        return false;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [eventId, router, t, tc, statusLabel],
  );

  const onDecode = useCallback(
    (raw: string) => {
      const now = Date.now();
      // The camera reports the same code many times per second — debounce.
      if (raw === lastScan.current.value && now - lastScan.current.at < 4000) return;
      lastScan.current = { value: raw, at: now };
      const payload = parseScan(raw);
      if (!payload) {
        setResult({ tone: "error", title: t("result.invalidQr"), detail: t("result.invalidQrHint"), at: now });
        return;
      }
      void submit(payload);
    },
    [submit, t],
  );

  const submitNumber = async (e: FormEvent) => {
    e.preventDefault();
    const v = number.trim().toUpperCase();
    if (!KTA_RE.test(v)) {
      setNumberError(t("numberFormat"));
      return;
    }
    setNumberError(null);
    if (await submit({ memberNumber: v })) setNumber("");
  };

  const submitGuest = async (e: FormEvent) => {
    e.preventDefault();
    if (guest.name.trim().length < 2) {
      setGuestError(t("guestNameRequired"));
      return;
    }
    setGuestError(null);
    const ok = await submit({
      guestName: guest.name.trim(),
      ...(guest.phone.trim() ? { guestPhone: guest.phone.trim() } : {}),
      ...(guest.gender ? { guestGender: guest.gender } : {}),
    });
    if (ok) setGuest({ name: "", phone: "", gender: "" });
  };

  const modes: { key: Mode; icon: typeof Camera; label: string }[] = [
    { key: "scan", icon: Camera, label: t("modes.scan") },
    { key: "number", icon: Hash, label: t("modes.number") },
    { key: "guest", icon: UserPlus, label: t("modes.guest") },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div role="tablist" aria-label={t("title")} className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1">
          {modes.map((m) => (
            <button
              key={m.key}
              type="button"
              role="tab"
              aria-selected={mode === m.key}
              onClick={() => setMode(m.key)}
              className={cn(
                "flex cursor-pointer items-center justify-center gap-1.5 rounded-sm px-2 py-2 text-sm font-medium text-muted-foreground",
                mode === m.key && "bg-background text-foreground shadow-sm",
              )}
            >
              <m.icon className="size-4" aria-hidden />
              <span className="truncate">{m.label}</span>
            </button>
          ))}
        </div>

        {mode === "scan" && <Scanner onDecode={onDecode} paused={busy} />}

        {mode === "number" && (
          <form onSubmit={submitNumber} className="space-y-3">
            <Field label={t("numberLabel")} htmlFor="ci-number" error={numberError} hint={t("numberHint")}>
              <Input
                value={number}
                onChange={(e) => setNumber(e.target.value.toUpperCase())}
                placeholder="PST-DI-2026-000042"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                className="h-12 font-mono text-lg"
                autoFocus
              />
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={busy}>
              <CheckCircle2 />
              {t("checkIn")}
            </Button>
          </form>
        )}

        {mode === "guest" && (
          <form onSubmit={submitGuest} className="space-y-3">
            <Field label={t("guestName")} htmlFor="ci-guest-name" required error={guestError}>
              <Input value={guest.name} onChange={(e) => setGuest((g) => ({ ...g, name: e.target.value }))} maxLength={180} autoComplete="off" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("guestPhone")} htmlFor="ci-guest-phone">
                <Input type="tel" inputMode="tel" value={guest.phone} onChange={(e) => setGuest((g) => ({ ...g, phone: e.target.value }))} maxLength={32} autoComplete="off" />
              </Field>
              <Field label={t("guestGender")} htmlFor="ci-guest-gender">
                <NativeSelect value={guest.gender} onChange={(e) => setGuest((g) => ({ ...g, gender: e.target.value }))}>
                  <option value="">{tc("geo.select")}</option>
                  <option value="MALE">{tc("enums.gender.MALE")}</option>
                  <option value="FEMALE">{tc("enums.gender.FEMALE")}</option>
                </NativeSelect>
              </Field>
            </div>
            <Button type="submit" size="lg" className="w-full" loading={busy}>
              <UserPlus />
              {t("registerGuest")}
            </Button>
          </form>
        )}

        <div aria-live="assertive" aria-atomic>
          {result && <ResultCard key={result.at} result={result} />}
        </div>
      </CardContent>
    </Card>
  );
}

function ResultCard({ result }: { result: Result }) {
  const styles = {
    ok: "border-green-500 bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100",
    warn: "border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
    error: "border-red-500 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100",
  };
  const Icon = result.tone === "ok" ? CheckCircle2 : result.tone === "warn" ? AlertTriangle : XCircle;
  return (
    <div className={cn("flex items-start gap-4 rounded-xl border-2 p-4 sm:p-5", styles[result.tone])}>
      <Icon className="size-10 shrink-0 sm:size-12" aria-hidden />
      <div className="min-w-0">
        <p className="text-base font-extrabold uppercase tracking-wide sm:text-lg">{result.title}</p>
        {result.name && <p className="mt-1 break-words text-xl font-bold sm:text-2xl">{result.name}</p>}
        {result.detail && <p className="mt-0.5 font-mono text-sm opacity-80">{result.detail}</p>}
      </div>
    </div>
  );
}

function Scanner({ onDecode, paused }: { onDecode: (raw: string) => void; paused: boolean }) {
  const t = useTranslations("events.checkin");
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScannerType | null>(null);
  const onDecodeRef = useRef(onDecode);
  const pausedRef = useRef(paused);
  const [state, setState] = useState<"idle" | "starting" | "running" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onDecodeRef.current = onDecode;
  }, [onDecode]);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const stop = useCallback(() => {
    scannerRef.current?.stop();
    scannerRef.current?.destroy();
    scannerRef.current = null;
    setState("idle");
  }, []);

  const start = useCallback(async () => {
    if (!videoRef.current) return;
    setState("starting");
    setError(null);
    try {
      const { default: QrScanner } = await import("qr-scanner");
      if (!(await QrScanner.hasCamera())) {
        setError(t("noCamera"));
        setState("error");
        return;
      }
      const scanner = new QrScanner(
        videoRef.current,
        (res) => {
          if (!pausedRef.current) onDecodeRef.current(res.data);
        },
        { returnDetailedScanResult: true, preferredCamera: "environment", highlightScanRegion: true, highlightCodeOutline: true, maxScansPerSecond: 5 },
      );
      scannerRef.current = scanner;
      await scanner.start();
      setState("running");
    } catch (e) {
      scannerRef.current?.destroy();
      scannerRef.current = null;
      const msg = String((e as Error)?.message ?? e);
      setError(/permission|denied|NotAllowed/i.test(msg) ? t("cameraDenied") : t("cameraError"));
      setState("error");
    }
  }, [t]);

  useEffect(() => () => stop(), [stop]);

  return (
    <div className="space-y-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-black sm:aspect-video">
        <video ref={videoRef} className="size-full object-cover" muted playsInline aria-label={t("cameraPreview")} />
        {state !== "running" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-white">
            <Camera className="size-10 opacity-70" aria-hidden />
            <p className="text-sm opacity-90">{error ?? t("scanHint")}</p>
          </div>
        )}
      </div>
      {state === "running" ? (
        <Button variant="outline" className="w-full" onClick={stop}>
          <CameraOff />
          {t("stopCamera")}
        </Button>
      ) : (
        <Button size="lg" className="w-full" onClick={start} loading={state === "starting"}>
          <Camera />
          {t("startCamera")}
        </Button>
      )}
    </div>
  );
}
