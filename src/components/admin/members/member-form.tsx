"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { api, ApiClientError, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/form-controls";
import { Alert, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { GeoSelect, type GeoValue } from "@/components/shared/geo-select";
import { EDUCATION_LEVELS, GENDERS, ID_DOC_TYPES, MEMBER_RANKS } from "@/lib/validation/member";
import type { MemberDto } from "./types";

type Values = {
  fullName: string;
  gender: string;
  birthDate: string;
  birthPlace: string;
  idDocumentType: string;
  idNumber: string;
  occupation: string;
  educationLevel: string;
  phone: string;
  email: string;
  addressLine: string;
  motivation: string;
  rank: string;
  joinedAt: string;
};

const initialValues = (m?: MemberDto): Values => ({
  fullName: m?.fullName ?? "",
  gender: m?.gender ?? "",
  birthDate: m?.birthDate ?? "",
  birthPlace: m?.birthPlace ?? "",
  idDocumentType: m?.idDocumentType ?? "BILHETE_IDENTIDADE",
  idNumber: "",
  occupation: m?.occupation ?? "",
  educationLevel: m?.educationLevel ?? "",
  phone: m?.phone ?? "",
  email: m?.email ?? "",
  addressLine: m?.addressLine ?? "",
  motivation: m?.motivation ?? "",
  rank: m?.rank ?? "MILITANT",
  joinedAt: m?.joinedAt ?? "",
});

const today = () => new Date().toISOString().slice(0, 10);

/** Create (multipart POST) or edit (JSON PATCH) a member record. */
export function MemberForm({ member, lockMunicipalityId }: { member?: MemberDto; lockMunicipalityId?: number | null }) {
  const t = useTranslations("members");
  const tc = useTranslations("common");
  const router = useRouter();
  const editing = !!member;

  const [v, setV] = useState<Values>(() => initialValues(member));
  const [geo, setGeo] = useState<GeoValue>({
    municipalityId: member?.location.municipality.id ?? lockMunicipalityId ?? undefined,
    adminPostId: member?.location.adminPost?.id,
    sucoId: member?.location.suco?.id,
    aldeiaId: member?.location.aldeia?.id,
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [idScan, setIdScan] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof Values) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  const err = (k: string) => errors[k] ?? null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    const local: Record<string, string> = {};
    if (!geo.municipalityId) local.municipalityId = t("form.municipalityRequired");
    if (!v.gender) local.gender = t("form.required");
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        const nul = (s: string) => (s.trim() ? s.trim() : null);
        const body: Record<string, unknown> = {
          fullName: v.fullName.trim(),
          gender: v.gender,
          birthDate: v.birthDate,
          birthPlace: nul(v.birthPlace),
          idDocumentType: v.idDocumentType,
          occupation: nul(v.occupation),
          educationLevel: v.educationLevel || null,
          phone: nul(v.phone),
          email: nul(v.email),
          municipalityId: geo.municipalityId,
          adminPostId: geo.adminPostId ?? null,
          sucoId: geo.sucoId ?? null,
          aldeiaId: geo.aldeiaId ?? null,
          addressLine: nul(v.addressLine),
          motivation: nul(v.motivation),
          rank: v.rank,
          joinedAt: v.joinedAt || null,
        };
        if (v.idNumber.trim()) body.idNumber = v.idNumber.trim();
        await api.patch(`/api/admin/members/${member.id}`, body);
        toast.success(t("form.updated"));
        router.push(`/admin/members/${member.id}`);
        router.refresh();
      } else {
        const fd = new FormData();
        for (const [k, val] of Object.entries(v)) if (val.trim()) fd.set(k, val.trim());
        for (const [k, val] of Object.entries(geo)) if (val) fd.set(k, String(val));
        if (photo) fd.set("photo", photo);
        if (idScan) fd.set("idScan", idScan);
        const created = await api.post<{ id: string; registrationRef: string }>("/api/admin/members", fd);
        toast.success(t("form.created", { ref: created.registrationRef }));
        router.push(`/admin/members/${created.id}`);
        router.refresh();
      }
    } catch (error) {
      if (error instanceof ApiClientError) {
        const fe = error.fieldErrors;
        if (Object.keys(fe).length) setErrors(fe);
        if (error.status === 409) setFormError(error.message);
      }
      toast.error(errorMessage(error, tc));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      {formError && <Alert variant="error">{formError}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle>{t("form.identity")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label={t("fields.fullName")} htmlFor="m-fullName" required error={err("fullName")} className="sm:col-span-2">
            <Input value={v.fullName} onChange={set("fullName")} required minLength={3} maxLength={180} autoComplete="off" />
          </Field>
          <Field label={t("fields.gender")} htmlFor="m-gender" required error={err("gender")}>
            <NativeSelect value={v.gender} onChange={set("gender")} required>
              <option value="">{tc("geo.select")}</option>
              {GENDERS.map((g) => (
                <option key={g} value={g}>
                  {tc(`enums.gender.${g}`)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t("fields.birthDate")} htmlFor="m-birthDate" required error={err("birthDate")}>
            <Input type="date" value={v.birthDate} onChange={set("birthDate")} required max={today()} />
          </Field>
          <Field label={t("fields.birthPlace")} htmlFor="m-birthPlace" error={err("birthPlace")}>
            <Input value={v.birthPlace} onChange={set("birthPlace")} maxLength={120} />
          </Field>
          <Field label={t("fields.educationLevel")} htmlFor="m-education" error={err("educationLevel")}>
            <NativeSelect value={v.educationLevel} onChange={set("educationLevel")}>
              <option value="">{tc("geo.select")}</option>
              {EDUCATION_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {tc(`enums.educationLevel.${l}`)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t("fields.idDocumentType")} htmlFor="m-idType" error={err("idDocumentType")}>
            <NativeSelect value={v.idDocumentType} onChange={set("idDocumentType")}>
              {ID_DOC_TYPES.map((d) => (
                <option key={d} value={d}>
                  {tc(`enums.idDocumentType.${d}`)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            label={t("fields.idNumber")}
            htmlFor="m-idNumber"
            error={err("idNumber")}
            hint={editing ? (member.idNumberMasked ? t("form.idNumberKeep", { masked: member.idNumberMasked }) : t("form.idNumberNone")) : t("form.idNumberHint")}
          >
            <Input value={v.idNumber} onChange={set("idNumber")} maxLength={40} autoComplete="off" spellCheck={false} />
          </Field>
          <Field label={t("fields.occupation")} htmlFor="m-occupation" error={err("occupation")} className="sm:col-span-2">
            <Input value={v.occupation} onChange={set("occupation")} maxLength={160} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("form.contactAddress")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("fields.phone")} htmlFor="m-phone" error={err("phone")} hint={t("form.phoneHint")}>
              <Input type="tel" inputMode="tel" value={v.phone} onChange={set("phone")} maxLength={32} autoComplete="off" />
            </Field>
            <Field label={t("fields.email")} htmlFor="m-email" error={err("email")}>
              <Input type="email" value={v.email} onChange={set("email")} maxLength={160} autoComplete="off" />
            </Field>
          </div>
          <GeoSelect
            value={geo}
            onChange={setGeo}
            required
            lockMunicipalityId={lockMunicipalityId}
            errors={{ municipalityId: err("municipalityId") ?? undefined, adminPostId: err("adminPostId") ?? undefined, sucoId: err("sucoId") ?? undefined, aldeiaId: err("aldeiaId") ?? undefined }}
          />
          <Field label={t("fields.addressLine")} htmlFor="m-address" error={err("addressLine")}>
            <Input value={v.addressLine} onChange={set("addressLine")} maxLength={255} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("form.membership")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label={t("fields.rank")} htmlFor="m-rank" error={err("rank")}>
            <NativeSelect value={v.rank} onChange={set("rank")}>
              {MEMBER_RANKS.map((r) => (
                <option key={r} value={r}>
                  {tc(`enums.memberRank.${r}`)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label={t("fields.joinedAt")} htmlFor="m-joinedAt" error={err("joinedAt")} hint={t("form.joinedAtHint")}>
            <Input type="date" value={v.joinedAt} onChange={set("joinedAt")} max={today()} />
          </Field>
          <Field label={t("fields.motivation")} htmlFor="m-motivation" error={err("motivation")} className="sm:col-span-2">
            <Textarea value={v.motivation} onChange={set("motivation")} maxLength={2000} rows={3} />
          </Field>
          {!editing && (
            <>
              <Field label={t("fields.photo")} htmlFor="m-photo" error={err("photo")} hint={t("form.photoHint")}>
                <Input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
              </Field>
              <Field label={t("fields.idScan")} htmlFor="m-idScan" error={err("idScan")} hint={t("form.idScanHint")}>
                <Input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setIdScan(e.target.files?.[0] ?? null)} />
              </Field>
            </>
          )}
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
