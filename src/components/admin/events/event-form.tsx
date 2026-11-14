"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { api, ApiClientError, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Field, Input, Label, NativeSelect, Textarea } from "@/components/ui/form-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { Switch } from "@/components/ui/overlays";
import { GeoSelect, type GeoValue } from "@/components/shared/geo-select";
import { EDIT_LOCALES, TranslationTabs, type EditLocale } from "@/components/admin/translation-tabs";
import { EVENT_STATUSES, EVENT_TYPES } from "@/lib/validation/content";

export interface EventFormInitial {
  id: string;
  type: string;
  status: string;
  isPublic: boolean;
  startsAt: Date | string;
  endsAt: Date | string | null;
  municipalityId: number | null;
  adminPostId?: number;
  sucoId: number | null;
  venue: string | null;
  capacity: number | null;
  expectedTurnout: number | null;
  translations: { locale: EditLocale; title: string; summary: string | null; contentHtml: string | null }[];
}

type Tr = { title: string; summary: string; contentHtml: string };
const emptyTr = (): Tr => ({ title: "", summary: "", contentHtml: "" });

const DILI_OFFSET = 9 * 3_600_000;
/** Date → "YYYY-MM-DDTHH:mm" wall-clock time in Asia/Dili (UTC+9, no DST). */
const toDiliInput = (d: Date | string | null | undefined) => (d ? new Date(new Date(d).getTime() + DILI_OFFSET).toISOString().slice(0, 16) : "");
/** "YYYY-MM-DDTHH:mm" in Dili → ISO string. */
const fromDiliInput = (v: string) => new Date(`${v}:00+09:00`).toISOString();

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Plain text → paragraphs; text that already contains HTML tags is sent as-is (sanitised server-side). */
function toHtml(text: string): string | undefined {
  const s = text.trim();
  if (!s) return undefined;
  if (/<[a-z][\s\S]*>/i.test(s)) return s;
  return s
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function EventForm({ initial, lockMunicipalityId }: { initial?: EventFormInitial; lockMunicipalityId?: number | null }) {
  const t = useTranslations("events");
  const tc = useTranslations("common");
  const router = useRouter();
  const editing = !!initial;

  const [tr, setTr] = useState<Record<EditLocale, Tr>>(() => {
    const base = Object.fromEntries(EDIT_LOCALES.map((l) => [l, emptyTr()])) as Record<EditLocale, Tr>;
    for (const x of initial?.translations ?? []) base[x.locale] = { title: x.title, summary: x.summary ?? "", contentHtml: x.contentHtml ?? "" };
    return base;
  });
  const [type, setType] = useState(initial?.type ?? "MEETING");
  const [status, setStatus] = useState(initial?.status ?? "SCHEDULED");
  const [isPublic, setIsPublic] = useState(initial?.isPublic ?? true);
  const [startsAt, setStartsAt] = useState(toDiliInput(initial?.startsAt));
  const [endsAt, setEndsAt] = useState(toDiliInput(initial?.endsAt));
  const [geo, setGeo] = useState<GeoValue>({
    municipalityId: initial?.municipalityId ?? lockMunicipalityId ?? undefined,
    adminPostId: initial?.adminPostId,
    sucoId: initial?.sucoId ?? undefined,
  });
  const [venue, setVenue] = useState(initial?.venue ?? "");
  const [capacity, setCapacity] = useState(initial?.capacity ? String(initial.capacity) : "");
  const [expected, setExpected] = useState(initial?.expectedTurnout ? String(initial.expectedTurnout) : "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const setTrField = (l: EditLocale, k: keyof Tr, v: string) => setTr((s) => ({ ...s, [l]: { ...s[l], [k]: v } }));
  const filled = Object.fromEntries(EDIT_LOCALES.map((l) => [l, tr[l].title.trim().length >= 3])) as Record<EditLocale, boolean>;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!filled.TET) local["title.TET"] = t("form.titleRequired");
    for (const l of EDIT_LOCALES) {
      const x = tr[l];
      if (!filled[l] && (x.title.trim() || x.summary.trim() || x.contentHtml.trim())) local[`title.${l}`] = t("form.titleMissing");
    }
    if (!startsAt) local.startsAt = t("form.required");
    if (endsAt && startsAt && endsAt < startsAt) local.endsAt = t("form.endBeforeStart");
    if (lockMunicipalityId && !geo.municipalityId) local.municipalityId = t("form.required");
    setErrors(local);
    if (Object.keys(local).length) {
      toast.error(tc("errors.validation"));
      return;
    }

    const optional = (key: string, v: unknown) => (v !== undefined ? { [key]: v } : editing ? { [key]: null } : {});
    const translations = EDIT_LOCALES.filter((l) => filled[l]).map((l) => ({
      locale: l,
      title: tr[l].title.trim(),
      summary: tr[l].summary.trim() || undefined,
      contentHtml: toHtml(tr[l].contentHtml),
    }));
    const body: Record<string, unknown> = {
      type,
      status,
      isPublic,
      startsAt: fromDiliInput(startsAt),
      translations,
      // On edit, empty fields are sent as null so they can be cleared; on create they are omitted.
      ...optional("municipalityId", geo.municipalityId),
      ...optional("sucoId", geo.sucoId),
      ...optional("venue", venue.trim() || undefined),
      ...optional("capacity", capacity ? Number(capacity) : undefined),
      ...optional("expectedTurnout", expected ? Number(expected) : undefined),
    };

    setBusy(true);
    try {
      if (editing) {
        body.endsAt = endsAt ? fromDiliInput(endsAt) : null;
        body.removeLocales = EDIT_LOCALES.filter((l) => !filled[l]);
        await api.patch(`/api/admin/events/${initial.id}`, body);
        toast.success(tc("states.saved"));
        router.push(`/admin/events/${initial.id}`);
      } else {
        if (endsAt) body.endsAt = fromDiliInput(endsAt);
        const created = await api.post<{ id: string }>("/api/admin/events", body);
        toast.success(t("form.created"));
        router.push(`/admin/events/${created.id}`);
      }
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError) {
        const fe = err.fieldErrors;
        const mapped: Record<string, string> = {};
        for (const [k, v] of Object.entries(fe)) {
          const m = /^translations\.(\d+)\.(\w+)/.exec(k);
          if (m) mapped[`${m[2]}.${translations[Number(m[1])]?.locale ?? "TET"}`] = v;
          else mapped[k] = v;
        }
        setErrors(mapped);
      }
      toast.error(errorMessage(err, tc));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("form.content")}</CardTitle>
        </CardHeader>
        <CardContent>
          <TranslationTabs filled={filled}>
            {(l) => (
              <div className="mt-4 space-y-4">
                <Field label={t("fields.title")} htmlFor={`ev-title-${l}`} required={l === "TET"} error={errors[`title.${l}`]}>
                  <Input value={tr[l].title} onChange={(e) => setTrField(l, "title", e.target.value)} maxLength={220} />
                </Field>
                <Field label={t("fields.summary")} htmlFor={`ev-summary-${l}`} error={errors[`summary.${l}`]}>
                  <Textarea value={tr[l].summary} onChange={(e) => setTrField(l, "summary", e.target.value)} maxLength={400} rows={2} />
                </Field>
                <Field label={t("fields.content")} htmlFor={`ev-content-${l}`} error={errors[`contentHtml.${l}`]} hint={t("form.contentHint")}>
                  <Textarea value={tr[l].contentHtml} onChange={(e) => setTrField(l, "contentHtml", e.target.value)} rows={8} />
                </Field>
              </div>
            )}
          </TranslationTabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("form.details")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("fields.type")} htmlFor="ev-type" required error={errors.type}>
              <NativeSelect value={type} onChange={(e) => setType(e.target.value)}>
                {EVENT_TYPES.map((v) => (
                  <option key={v} value={v}>
                    {tc(`enums.eventType.${v}`)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t("fields.status")} htmlFor="ev-status" required error={errors.status}>
              <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)}>
                {EVENT_STATUSES.map((v) => (
                  <option key={v} value={v}>
                    {tc(`enums.eventStatus.${v}`)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t("fields.startsAt")} htmlFor="ev-start" required error={errors.startsAt} hint={t("form.timezoneHint")}>
              <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </Field>
            <Field label={t("fields.endsAt")} htmlFor="ev-end" error={errors.endsAt}>
              <Input type="datetime-local" value={endsAt} min={startsAt || undefined} onChange={(e) => setEndsAt(e.target.value)} />
            </Field>
          </div>

          <div>
            <GeoSelect
              value={geo}
              onChange={setGeo}
              levels="suco"
              allowAny={!lockMunicipalityId}
              lockMunicipalityId={lockMunicipalityId}
              errors={{ municipalityId: errors.municipalityId, sucoId: errors.sucoId }}
            />
            {!lockMunicipalityId && <p className="mt-1.5 text-xs text-muted-foreground">{t("form.nationalHint")}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t("fields.venue")} htmlFor="ev-venue" error={errors.venue} className="sm:col-span-3">
              <Input value={venue} onChange={(e) => setVenue(e.target.value)} maxLength={200} />
            </Field>
            <Field label={t("fields.capacity")} htmlFor="ev-capacity" error={errors.capacity}>
              <Input type="number" inputMode="numeric" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </Field>
            <Field label={t("fields.expectedTurnout")} htmlFor="ev-expected" error={errors.expectedTurnout}>
              <Input type="number" inputMode="numeric" min={1} value={expected} onChange={(e) => setExpected(e.target.value)} />
            </Field>
            <div className="flex items-center gap-3 sm:pt-6">
              <Switch id="ev-public" checked={isPublic} onCheckedChange={setIsPublic} />
              <Label htmlFor="ev-public">{t("fields.isPublic")}</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          {tc("actions.cancel")}
        </Button>
        <Button type="submit" loading={busy}>
          <Save />
          {editing ? tc("actions.save") : t("form.submitCreate")}
        </Button>
      </div>
    </form>
  );
}
