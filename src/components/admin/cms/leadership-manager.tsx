"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Crown, MoreHorizontal, Pencil, Plus, Trash2, UserRound, Users } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { api, errorMessage } from "@/lib/api-client";
import { TranslationTabs } from "@/components/admin/translation-tabs";
import { Button } from "@/components/ui/button";
import { Field, Input, Label, NativeSelect, Textarea } from "@/components/ui/form-controls";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState } from "@/components/ui/primitives";
import { ConfirmDialog, Dialog, DialogContent, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Switch } from "@/components/ui/overlays";
import { formatDay } from "@/lib/format";
import { byLocale, fromRows, mapFieldErrors, pickRow, toDateInput, translationPayload, type ByLocale } from "./form-helpers";
import { MediaField } from "./media-picker";
import type { MediaRef } from "./media-types";

export const LEADERSHIP_LEVELS = ["PRESIDENCY", "POLITICAL_COMMISSION", "CENTRAL_COMMITTEE", "NATIONAL_SECRETARIAT", "MUNICIPAL_COMMITTEE", "WING"] as const;
type Level = (typeof LEADERSHIP_LEVELS)[number];

export interface LeadershipRow {
  id: string;
  level: Level;
  municipalityId: number | null;
  municipalityName: string | null;
  fullName: string;
  photoId: string | null;
  photoUrl: string | null;
  phone: string | null;
  email: string | null;
  isCoordinator: boolean;
  sortOrder: number;
  termStart: string | Date | null;
  termEnd: string | Date | null;
  isActive: boolean;
  translations: { locale: string; positionTitle: string; bio: string | null }[];
}

export function LeadershipManager({
  rows,
  municipalities,
  canWrite,
}: {
  rows: LeadershipRow[];
  municipalities: { id: number; name: string }[];
  canWrite: boolean;
}) {
  const t = useTranslations("cms");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [editing, setEditing] = useState<LeadershipRow | { level: Level } | null>(null);
  const [deleting, setDeleting] = useState<LeadershipRow | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.delete(`/api/admin/leadership/${deleting.id}`);
      toast.success(t("leadership.deleted"));
      setDeleting(null);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, tc));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {canWrite && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => setEditing({ level: "CENTRAL_COMMITTEE" })}>
            <Plus aria-hidden />
            {t("leadership.new")}
          </Button>
        </div>
      )}
      {rows.length === 0 ? (
        <EmptyState icon={Users} title={t("leadership.empty")} description={canWrite ? t("leadership.emptyHint") : undefined} />
      ) : (
        <div className="space-y-4">
          {LEADERSHIP_LEVELS.map((level) => {
            const group = rows.filter((r) => r.level === level);
            if (!group.length) return null;
            return (
              <Card key={level}>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="text-base">
                    {tc(`enums.leadershipLevel.${level}`)} <span className="font-normal text-muted-foreground">({group.length})</span>
                  </CardTitle>
                  {canWrite && (
                    <Button size="sm" variant="ghost" onClick={() => setEditing({ level })}>
                      <Plus aria-hidden />
                      {tc("actions.add")}
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  <ul className="divide-y">
                    {group.map((r) => {
                      const tr = pickRow(r.translations, locale);
                      return (
                        <li key={r.id} className="flex items-center gap-3 py-2.5">
                          {r.photoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.photoUrl} alt="" className="size-11 shrink-0 rounded-full border object-cover" />
                          ) : (
                            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted">
                              <UserRound className="size-5 text-muted-foreground" aria-hidden />
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold">
                              {r.fullName}
                              {r.isCoordinator && <Crown className="ml-1 inline size-3.5 text-pst-gold" aria-label={t("leadership.coordinator")} />}
                            </p>
                            <p className="truncate text-sm text-muted-foreground">{tr?.positionTitle ?? "—"}</p>
                            <div className="mt-0.5 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                              {r.municipalityName && <Badge variant="outline">{r.municipalityName}</Badge>}
                              {!r.isActive && <Badge variant="muted">{t("leadership.inactive")}</Badge>}
                              {(r.termStart || r.termEnd) && (
                                <span>
                                  {r.termStart ? formatDay(r.termStart, locale) : "…"} – {r.termEnd ? formatDay(r.termEnd, locale) : "…"}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="hidden text-xs tabular-nums text-muted-foreground sm:block" title={t("leadership.sortOrder")}>
                            #{r.sortOrder}
                          </span>
                          {canWrite && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="icon-sm" variant="ghost" aria-label={t("rowActions")}>
                                  <MoreHorizontal aria-hidden />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent>
                                <DropdownMenuItem onSelect={() => setEditing(r)}>
                                  <Pencil aria-hidden />
                                  {tc("actions.edit")}
                                </DropdownMenuItem>
                                <DropdownMenuItem destructive onSelect={() => setDeleting(r)}>
                                  <Trash2 aria-hidden />
                                  {tc("actions.delete")}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {editing && (
        <LeadershipDialog
          key={"id" in editing ? editing.id : `new-${editing.level}`}
          row={"id" in editing ? editing : null}
          defaultLevel={editing.level}
          municipalities={municipalities}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t("leadership.deleteTitle")}
        description={t("leadership.deleteDescription", { name: deleting?.fullName ?? "" })}
        confirmLabel={tc("actions.delete")}
        cancelLabel={tc("actions.cancel")}
        destructive
        loading={busy}
        onConfirm={remove}
      />
    </>
  );
}

interface LeadTr {
  positionTitle: string;
  bio: string;
}

function LeadershipDialog({
  row,
  defaultLevel,
  municipalities,
  onClose,
  onSaved,
}: {
  row: LeadershipRow | null;
  defaultLevel: Level;
  municipalities: { id: number; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("cms");
  const tc = useTranslations("common");
  const [level, setLevel] = useState<Level>(row?.level ?? defaultLevel);
  const [municipalityId, setMunicipalityId] = useState(row?.municipalityId ? String(row.municipalityId) : "");
  const [fullName, setFullName] = useState(row?.fullName ?? "");
  const [photo, setPhoto] = useState<MediaRef | null>(row?.photoId ? { id: row.photoId, url: row.photoUrl, kind: "IMAGE" } : null);
  const [phone, setPhone] = useState(row?.phone ?? "");
  const [email, setEmail] = useState(row?.email ?? "");
  const [isCoordinator, setCoordinator] = useState(row?.isCoordinator ?? false);
  const [sortOrder, setSortOrder] = useState(String(row?.sortOrder ?? 0));
  const [termStart, setTermStart] = useState(toDateInput(row?.termStart));
  const [termEnd, setTermEnd] = useState(toDateInput(row?.termEnd));
  const [isActive, setActive] = useState(row?.isActive ?? true);
  const [tr, setTr] = useState<ByLocale<LeadTr>>(() =>
    fromRows(row?.translations, () => ({ positionTitle: "", bio: "" }), (r) => ({ positionTitle: r.positionTitle, bio: r.bio ?? "" })),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const municipal = level === "MUNICIPAL_COMMITTEE";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (municipal && !municipalityId) local.municipalityId = t("leadership.municipalityRequired");
    if (termStart && termEnd && termEnd < termStart) local.termEnd = t("leadership.termOrder");
    const { sent, translations, removeLocales } = translationPayload(
      tr,
      (v) => !!v.positionTitle.trim(),
      (l, v) => ({ locale: l, positionTitle: v.positionTitle.trim(), bio: v.bio }),
      row?.translations.map((x) => x.locale),
    );
    if (!sent.length) local["TET.positionTitle"] = t("leadership.positionRequired");
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    const body = {
      level,
      municipalityId: municipal ? Number(municipalityId) : row ? null : undefined,
      fullName: fullName.trim(),
      photoId: photo?.id ?? (row ? null : undefined),
      phone: phone.trim(),
      email: email.trim(),
      isCoordinator: municipal ? isCoordinator : false,
      sortOrder: Math.max(0, Math.min(10_000, Number(sortOrder) || 0)),
      termStart: termStart || null,
      termEnd: termEnd || null,
      isActive,
      translations,
      ...(row ? { removeLocales } : {}),
    };
    setBusy(true);
    setErrors({});
    try {
      if (row) await api.patch(`/api/admin/leadership/${row.id}`, body);
      else await api.post("/api/admin/leadership", body);
      toast.success(row ? tc("states.saved") : t("leadership.created"));
      onSaved();
    } catch (err) {
      setErrors(mapFieldErrors(err, sent));
      toast.error(errorMessage(err, tc));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide title={row ? t("leadership.edit") : t("leadership.new")}>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
            <div className="grid content-start gap-4 sm:grid-cols-2">
              <Field label={t("leadership.fullName")} htmlFor="lead-name" required error={errors.fullName} className="sm:col-span-2">
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required minLength={3} maxLength={180} />
              </Field>
              <Field label={t("leadership.level")} htmlFor="lead-level" required error={errors.level}>
                <NativeSelect value={level} onChange={(e) => setLevel(e.target.value as Level)}>
                  {LEADERSHIP_LEVELS.map((v) => (
                    <option key={v} value={v}>
                      {tc(`enums.leadershipLevel.${v}`)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              {municipal ? (
                <Field label={tc("geo.municipality")} htmlFor="lead-mun" required error={errors.municipalityId}>
                  <NativeSelect value={municipalityId} onChange={(e) => setMunicipalityId(e.target.value)} required>
                    <option value="">{tc("geo.select")}</option>
                    {municipalities.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              ) : (
                <div className="hidden sm:block" />
              )}
              <Field label={t("leadership.phone")} htmlFor="lead-phone" error={errors.phone}>
                <Input type="tel" value={phone} maxLength={32} onChange={(e) => setPhone(e.target.value)} />
              </Field>
              <Field label={t("leadership.email")} htmlFor="lead-email" error={errors.email}>
                <Input type="email" value={email} maxLength={160} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field label={t("leadership.termStart")} htmlFor="lead-start" error={errors.termStart}>
                <Input type="date" value={termStart} onChange={(e) => setTermStart(e.target.value)} />
              </Field>
              <Field label={t("leadership.termEnd")} htmlFor="lead-end" error={errors.termEnd}>
                <Input type="date" value={termEnd} min={termStart || undefined} onChange={(e) => setTermEnd(e.target.value)} />
              </Field>
              <Field label={t("leadership.sortOrder")} htmlFor="lead-sort" hint={t("leadership.sortOrderHint")} error={errors.sortOrder}>
                <Input type="number" min={0} max={10000} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
              </Field>
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="lead-active">{t("leadership.active")}</Label>
                  <Switch id="lead-active" checked={isActive} onCheckedChange={setActive} />
                </div>
                {municipal && (
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="lead-coord">{t("leadership.coordinator")}</Label>
                    <Switch id="lead-coord" checked={isCoordinator} onCheckedChange={setCoordinator} />
                  </div>
                )}
              </div>
            </div>
            <MediaField id="lead-photo" label={t("leadership.photo")} value={photo} onChange={setPhoto} aspect="aspect-square" error={errors.photoId} />
          </div>

          <TranslationTabs filled={byLocale((l) => !!tr[l].positionTitle.trim())}>
            {(l) => (
              <div className="space-y-4 pt-2">
                <Field label={t("leadership.positionTitle")} htmlFor={`lead-pos-${l}`} required={l === "TET"} error={errors[`${l}.positionTitle`]}>
                  <Input
                    value={tr[l].positionTitle}
                    maxLength={220}
                    onChange={(e) => setTr((s) => ({ ...s, [l]: { ...s[l], positionTitle: e.target.value } }))}
                  />
                </Field>
                <Field label={t("leadership.bio")} htmlFor={`lead-bio-${l}`} error={errors[`${l}.bio`]}>
                  <Textarea value={tr[l].bio} maxLength={5000} rows={5} onChange={(e) => setTr((s) => ({ ...s, [l]: { ...s[l], bio: e.target.value } }))} />
                </Field>
              </div>
            )}
          </TranslationTabs>

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              {tc("actions.cancel")}
            </Button>
            <Button type="submit" loading={busy}>
              {tc("actions.save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
