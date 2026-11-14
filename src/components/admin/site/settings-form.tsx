"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { api, ApiClientError, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Field, Input, Label } from "@/components/ui/form-controls";
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import { Switch } from "@/components/ui/overlays";
import { formatDateTime } from "@/lib/format";

const LANGS = ["tet", "pt", "id", "en"] as const;
const SOCIAL = ["facebook", "youtube", "instagram", "tiktok", "x"] as const;
const CONTACT = ["address", "phone", "email", "whatsapp"] as const;

export interface SettingRow {
  key: string;
  value: unknown;
  updatedAt: string | null;
  updatedBy: { id: string; name: string } | null;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

export function SettingsForm({ settings }: { settings: SettingRow[] }) {
  const t = useTranslations("cms.settings");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const get = (k: string) => settings.find((s) => s.key === k)?.value;

  const [siteName, setSiteName] = useState<Record<string, string>>(() => Object.fromEntries(LANGS.map((l) => [l, str(obj(get("site.name"))[l])])));
  const [shortName, setShortName] = useState(str(get("site.shortName")));
  const [motto, setMotto] = useState(str(get("site.motto")));
  const [contact, setContact] = useState<Record<string, string>>(() => Object.fromEntries(CONTACT.map((k) => [k, str(obj(get("contact.headquarters"))[k])])));
  const [social, setSocial] = useState<Record<string, string>>(() => Object.fromEntries(SOCIAL.map((k) => [k, str(obj(get("social.links"))[k])])));
  const [consentVersion, setConsentVersion] = useState(str(get("membership.consentVersion")));
  const [minimumAge, setMinimumAge] = useState(str(get("membership.minimumAge") ?? 17));
  const [requireIdScan, setRequireIdScan] = useState(get("membership.requireIdScan") !== false);
  const [validityYears, setValidityYears] = useState(str(get("kta.validityYears") ?? 5));
  const [autoAck, setAutoAck] = useState(get("aspiration.autoAcknowledge") !== false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const lastUpdate = settings
    .filter((s) => s.updatedAt)
    .sort((a, b) => (a.updatedAt! < b.updatedAt! ? 1 : -1))[0];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const values: Record<string, unknown> = {
      "site.name": Object.fromEntries(LANGS.map((l) => [l, siteName[l]!.trim()])),
      "site.shortName": shortName.trim(),
      "site.motto": motto.trim(),
      "contact.headquarters": Object.fromEntries(CONTACT.map((k) => [k, contact[k]!.trim() || null])),
      "social.links": Object.fromEntries(SOCIAL.map((k) => [k, social[k]!.trim() || null])),
      "membership.consentVersion": consentVersion.trim(),
      "membership.minimumAge": Number(minimumAge),
      "membership.requireIdScan": requireIdScan,
      "kta.validityYears": Number(validityYears),
      "aspiration.autoAcknowledge": autoAck,
    };
    setBusy(true);
    setErrors({});
    try {
      await api.patch("/api/admin/site/settings", { values });
      toast.success(tc("states.saved"));
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "VALIDATION_ERROR" && Array.isArray(err.details)) {
        const map: Record<string, string> = {};
        for (const d of err.details as { path: string; message: string }[]) {
          // "values.<key>[.<field>]" — keys themselves contain dots, so match by known prefix.
          const rest = d.path.replace(/^values\./, "");
          if (!map[rest]) map[rest] = d.message;
        }
        setErrors(map);
      }
      toast.error(errorMessage(err, tc));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Alert variant="warning">{t("superAdminOnly")}</Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("identity")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {LANGS.map((l) => (
            <Field key={l} label={`${t("siteName")} · ${tc(`langName.${l}`)}`} htmlFor={`set-name-${l}`} required error={errors[`site.name.${l}`]}>
              <Input value={siteName[l] ?? ""} maxLength={120} required onChange={(e) => setSiteName((s) => ({ ...s, [l]: e.target.value }))} />
            </Field>
          ))}
          <Field label={t("shortName")} htmlFor="set-short" required error={errors["site.shortName"]}>
            <Input value={shortName} maxLength={20} required onChange={(e) => setShortName(e.target.value)} />
          </Field>
          <Field label={t("motto")} htmlFor="set-motto" hint={t("mottoHint")} required error={errors["site.motto"]}>
            <Input value={motto} maxLength={160} required onChange={(e) => setMotto(e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("headquarters")}</CardTitle>
          <CardDescription>{t("headquartersHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {CONTACT.map((k) => (
            <Field key={k} label={t(`contact.${k}`)} htmlFor={`set-contact-${k}`} error={errors[`contact.headquarters.${k}`]} className={k === "address" ? "sm:col-span-2" : undefined}>
              <Input
                type={k === "email" ? "email" : k === "address" ? "text" : "tel"}
                value={contact[k] ?? ""}
                maxLength={k === "address" ? 255 : k === "email" ? 160 : 32}
                onChange={(e) => setContact((s) => ({ ...s, [k]: e.target.value }))}
              />
            </Field>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("social")}</CardTitle>
          <CardDescription>{t("socialHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {SOCIAL.map((k) => (
            <Field key={k} label={t(`socialNames.${k}`)} htmlFor={`set-social-${k}`} error={errors[`social.links.${k}`]}>
              <Input type="url" inputMode="url" placeholder="https://" value={social[k] ?? ""} maxLength={300} onChange={(e) => setSocial((s) => ({ ...s, [k]: e.target.value }))} />
            </Field>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("membership")}</CardTitle>
          <CardDescription>{t("membershipHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label={t("consentVersion")} htmlFor="set-consent" hint={t("consentVersionHint")} required error={errors["membership.consentVersion"]}>
            <Input value={consentVersion} maxLength={20} required onChange={(e) => setConsentVersion(e.target.value)} />
          </Field>
          <Field label={t("minimumAge")} htmlFor="set-age" required error={errors["membership.minimumAge"]}>
            <Input type="number" min={14} max={30} value={minimumAge} required onChange={(e) => setMinimumAge(e.target.value)} />
          </Field>
          <Field label={t("ktaValidity")} htmlFor="set-kta" hint={t("ktaValidityHint")} required error={errors["kta.validityYears"]}>
            <Input type="number" min={1} max={20} value={validityYears} required onChange={(e) => setValidityYears(e.target.value)} />
          </Field>
          <div className="space-y-3 sm:pt-6">
            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <Label htmlFor="set-idscan">{t("requireIdScan")}</Label>
              <Switch id="set-idscan" checked={requireIdScan} onCheckedChange={setRequireIdScan} />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <Label htmlFor="set-ack">{t("autoAcknowledge")}</Label>
              <Switch id="set-ack" checked={autoAck} onCheckedChange={setAutoAck} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <p className="text-xs text-muted-foreground">
          {lastUpdate?.updatedAt
            ? t("lastUpdated", { date: formatDateTime(lastUpdate.updatedAt, locale), name: lastUpdate.updatedBy?.name ?? "—" })
            : null}
        </p>
        <Button type="submit" loading={busy}>
          <Save aria-hidden />
          {tc("actions.save")}
        </Button>
      </div>
    </form>
  );
}
