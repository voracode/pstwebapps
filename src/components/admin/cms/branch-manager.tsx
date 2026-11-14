"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Building2, MapPin, MoreHorizontal, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { api, errorMessage } from "@/lib/api-client";
import { GeoSelect, type GeoValue } from "@/components/shared/geo-select";
import { Button } from "@/components/ui/button";
import { Field, Input, Label, NativeSelect } from "@/components/ui/form-controls";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState } from "@/components/ui/primitives";
import { ConfirmDialog, Dialog, DialogContent, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Switch } from "@/components/ui/overlays";
import { mapFieldErrors } from "./form-helpers";

const LANGS = ["tet", "pt", "id", "en"] as const;

export interface BranchRow {
  id: string;
  municipalityId: number;
  municipalityName: string;
  adminPostId: number | null;
  adminPostName: string | null;
  coordinatorId: string | null;
  coordinatorName: string | null;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  latitude: number | null;
  longitude: number | null;
  openingHours: Record<string, string> | null;
  isHeadquarters: boolean;
  isActive: boolean;
}

export interface CoordinatorOption {
  id: string;
  fullName: string;
  municipalityId: number | null;
  isCoordinator: boolean;
}

export function BranchManager({
  branches,
  municipalities,
  coordinators,
  canWrite,
}: {
  branches: BranchRow[];
  municipalities: { id: number; name: string }[];
  coordinators: CoordinatorOption[];
  canWrite: boolean;
}) {
  const t = useTranslations("cms");
  const tc = useTranslations("common");
  const router = useRouter();
  const [editing, setEditing] = useState<BranchRow | { municipalityId?: number } | null>(null);
  const [deleting, setDeleting] = useState<BranchRow | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.delete(`/api/admin/branches/${deleting.id}`);
      toast.success(t("branches.deleted"));
      setDeleting(null);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, tc));
    } finally {
      setBusy(false);
    }
  };

  const groups = municipalities.map((m) => ({ ...m, items: branches.filter((b) => b.municipalityId === m.id) })).filter((g) => g.items.length);

  return (
    <>
      {canWrite && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => setEditing({})}>
            <Plus aria-hidden />
            {t("branches.new")}
          </Button>
        </div>
      )}
      {groups.length === 0 ? (
        <EmptyState icon={Building2} title={t("branches.empty")} description={canWrite ? t("branches.emptyHint") : undefined} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map((g) => (
            <Card key={g.id}>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-base">{g.name}</CardTitle>
                {canWrite && (
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ municipalityId: g.id })}>
                    <Plus aria-hidden />
                    {tc("actions.add")}
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {g.items.map((b) => (
                    <li key={b.id} className="flex items-start gap-3 py-2.5">
                      <Building2 className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="font-semibold">
                          {b.name}{" "}
                          {b.isHeadquarters && <Badge variant="gold">{t("branches.headquarters")}</Badge>}{" "}
                          {!b.isActive && <Badge variant="muted">{t("branches.inactive")}</Badge>}
                        </p>
                        {(b.adminPostName || b.address) && (
                          <p className="flex items-center gap-1 text-muted-foreground">
                            <MapPin className="size-3.5 shrink-0" aria-hidden />
                            <span className="truncate">{[b.address, b.adminPostName].filter(Boolean).join(" · ")}</span>
                          </p>
                        )}
                        {b.phone && (
                          <p className="flex items-center gap-1 text-muted-foreground">
                            <Phone className="size-3.5 shrink-0" aria-hidden />
                            {b.phone}
                          </p>
                        )}
                        {b.coordinatorName && (
                          <p className="text-xs text-muted-foreground">
                            {t("branches.coordinator")}: {b.coordinatorName}
                          </p>
                        )}
                      </div>
                      {canWrite && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon-sm" variant="ghost" aria-label={t("rowActions")}>
                              <MoreHorizontal aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem onSelect={() => setEditing(b)}>
                              <Pencil aria-hidden />
                              {tc("actions.edit")}
                            </DropdownMenuItem>
                            <DropdownMenuItem destructive onSelect={() => setDeleting(b)}>
                              <Trash2 aria-hidden />
                              {tc("actions.delete")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <BranchDialog
          key={"id" in editing ? editing.id : `new-${editing.municipalityId ?? ""}`}
          branch={"id" in editing ? editing : null}
          defaultMunicipalityId={editing.municipalityId}
          coordinators={coordinators}
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
        title={t("branches.deleteTitle")}
        description={t("branches.deleteDescription", { name: deleting?.name ?? "" })}
        confirmLabel={tc("actions.delete")}
        cancelLabel={tc("actions.cancel")}
        destructive
        loading={busy}
        onConfirm={remove}
      />
    </>
  );
}

function BranchDialog({
  branch,
  defaultMunicipalityId,
  coordinators,
  onClose,
  onSaved,
}: {
  branch: BranchRow | null;
  defaultMunicipalityId?: number;
  coordinators: CoordinatorOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("cms");
  const tc = useTranslations("common");
  const [geo, setGeo] = useState<GeoValue>({
    municipalityId: branch?.municipalityId ?? defaultMunicipalityId,
    adminPostId: branch?.adminPostId ?? undefined,
  });
  const [name, setName] = useState(branch?.name ?? "");
  const [address, setAddress] = useState(branch?.address ?? "");
  const [phone, setPhone] = useState(branch?.phone ?? "");
  const [email, setEmail] = useState(branch?.email ?? "");
  const [lat, setLat] = useState(branch?.latitude != null ? String(branch.latitude) : "");
  const [lng, setLng] = useState(branch?.longitude != null ? String(branch.longitude) : "");
  const [coordinatorId, setCoordinatorId] = useState(branch?.coordinatorId ?? "");
  const [hours, setHours] = useState<Record<string, string>>(() => Object.fromEntries(LANGS.map((l) => [l, branch?.openingHours?.[l] ?? ""])));
  const [isHeadquarters, setHq] = useState(branch?.isHeadquarters ?? false);
  const [isActive, setActive] = useState(branch?.isActive ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const options = coordinators.filter((c) => c.municipalityId === geo.municipalityId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!geo.municipalityId) local.municipalityId = t("branches.municipalityRequired");
    const latN = lat.trim() ? Number(lat) : null;
    const lngN = lng.trim() ? Number(lng) : null;
    if (latN !== null && (!Number.isFinite(latN) || latN < -10 || latN > -8)) local.latitude = t("branches.latRange");
    if (lngN !== null && (!Number.isFinite(lngN) || lngN < 124 || lngN > 128)) local.longitude = t("branches.lngRange");
    if ((latN === null) !== (lngN === null)) local[latN === null ? "latitude" : "longitude"] = t("branches.coordsBoth");
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    const openingHours = Object.fromEntries(Object.entries(hours).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
    const body = {
      municipalityId: geo.municipalityId,
      adminPostId: geo.adminPostId ?? null,
      coordinatorId: coordinatorId || null,
      name: name.trim(),
      address: address.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      latitude: latN,
      longitude: lngN,
      openingHours: Object.keys(openingHours).length ? openingHours : null,
      isHeadquarters,
      isActive,
    };
    setBusy(true);
    setErrors({});
    try {
      if (branch) await api.put(`/api/admin/branches/${branch.id}`, body);
      else await api.post("/api/admin/branches", body);
      toast.success(branch ? tc("states.saved") : t("branches.created"));
      onSaved();
    } catch (err) {
      setErrors(mapFieldErrors(err));
      toast.error(errorMessage(err, tc));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide title={branch ? t("branches.edit") : t("branches.new")}>
        <form onSubmit={submit} className="space-y-5">
          <GeoSelect
            value={geo}
            onChange={(v) => {
              if (v.municipalityId !== geo.municipalityId) setCoordinatorId("");
              setGeo(v);
            }}
            levels="adminPost"
            required
            errors={{ municipalityId: errors.municipalityId, adminPostId: errors.adminPostId }}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("branches.name")} htmlFor="br-name" required error={errors.name} className="sm:col-span-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={3} maxLength={160} />
            </Field>
            <Field label={t("branches.address")} htmlFor="br-address" error={errors.address} className="sm:col-span-2">
              <Input value={address} maxLength={255} onChange={(e) => setAddress(e.target.value)} />
            </Field>
            <Field label={t("branches.phone")} htmlFor="br-phone" error={errors.phone}>
              <Input type="tel" value={phone} maxLength={32} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label={t("branches.email")} htmlFor="br-email" error={errors.email}>
              <Input type="email" value={email} maxLength={160} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label={t("branches.latitude")} htmlFor="br-lat" hint="-8.5569" error={errors.latitude}>
              <Input type="number" step="0.000001" min={-10} max={-8} inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} />
            </Field>
            <Field label={t("branches.longitude")} htmlFor="br-lng" hint="125.5603" error={errors.longitude}>
              <Input type="number" step="0.000001" min={124} max={128} inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} />
            </Field>
            <Field
              label={t("branches.coordinator")}
              htmlFor="br-coord"
              hint={geo.municipalityId && !options.length ? t("branches.noCoordinators") : t("branches.coordinatorHint")}
              error={errors.coordinatorId}
              className="sm:col-span-2"
            >
              <NativeSelect value={coordinatorId} onChange={(e) => setCoordinatorId(e.target.value)} disabled={!options.length}>
                <option value="">{t("branches.noCoordinator")}</option>
                {options.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName}
                    {c.isCoordinator ? ` ★` : ""}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>

          <fieldset className="space-y-3 rounded-md border p-3">
            <legend className="px-1 text-sm font-semibold">{t("branches.openingHours")}</legend>
            <p className="text-xs text-muted-foreground">{t("branches.openingHoursHint")}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {LANGS.map((l) => (
                <Field key={l} label={tc(`langName.${l}`)} htmlFor={`br-hours-${l}`} error={errors[`openingHours.${l}`]}>
                  <Input value={hours[l] ?? ""} maxLength={200} onChange={(e) => setHours((h) => ({ ...h, [l]: e.target.value }))} />
                </Field>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <Label htmlFor="br-hq">{t("branches.headquarters")}</Label>
              <Switch id="br-hq" checked={isHeadquarters} onCheckedChange={setHq} />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <Label htmlFor="br-active">{t("branches.active")}</Label>
              <Switch id="br-active" checked={isActive} onCheckedChange={setActive} />
            </div>
          </div>

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
