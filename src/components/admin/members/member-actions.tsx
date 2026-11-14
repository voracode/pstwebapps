"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Camera, CheckCircle2, Pencil, RotateCcw, ShieldOff, Trash2, XCircle } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { api, ApiClientError, errorMessage } from "@/lib/api-client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form-controls";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/overlays";
import { TRANSITIONS, type MemberStatus } from "./types";

const ACTION: Record<string, { key: string; icon: typeof CheckCircle2; variant: "default" | "outline" | "destructive" }> = {
  "PENDING>VERIFIED": { key: "approve", icon: CheckCircle2, variant: "default" },
  "PENDING>REJECTED": { key: "reject", icon: XCircle, variant: "outline" },
  "VERIFIED>SUSPENDED": { key: "suspend", icon: ShieldOff, variant: "outline" },
  "SUSPENDED>VERIFIED": { key: "reinstate", icon: RotateCcw, variant: "default" },
  "REJECTED>PENDING": { key: "reopen", icon: RotateCcw, variant: "outline" },
};

const NEEDS_REASON: MemberStatus[] = ["REJECTED", "SUSPENDED"];

export function MemberActions({
  memberId,
  status,
  fullName,
  canVerify,
  canUpdate,
  canDelete,
}: {
  memberId: string;
  status: MemberStatus;
  fullName: string;
  canVerify: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const t = useTranslations("members");
  const tc = useTranslations("common");
  const router = useRouter();
  const [target, setTarget] = useState<MemberStatus | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "photo" | "delete">(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const openStatus = (to: MemberStatus) => {
    setTarget(to);
    setReason("");
    setReasonError(null);
  };

  const changeStatus = async () => {
    if (!target) return;
    if (NEEDS_REASON.includes(target) && reason.trim().length < 3) {
      setReasonError(t("actions.reasonRequired"));
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ memberNumber: string | null }>(`/api/admin/members/${memberId}/status`, {
        status: target,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      toast.success(target === "VERIFIED" && res.memberNumber ? t("actions.approvedWithNumber", { number: res.memberNumber }) : t("actions.statusChanged"));
      setTarget(null);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.fieldErrors.reason) setReasonError(err.fieldErrors.reason);
      toast.error(errorMessage(err, tc));
      if (err instanceof ApiClientError && err.status === 409) router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const uploadPhoto = async () => {
    if (!photo) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("photo", photo);
      await api.post(`/api/admin/members/${memberId}/photo`, fd);
      toast.success(t("actions.photoReplaced"));
      setDialog(null);
      setPhoto(null);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, tc));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.delete(`/api/admin/members/${memberId}`);
      toast.success(t("actions.deleted"));
      router.replace("/admin/members");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, tc));
      setBusy(false);
    }
  };

  const transitions = canVerify ? TRANSITIONS[status] : [];
  const active = target ? ACTION[`${status}>${target}`] : null;

  return (
    <>
      {transitions.map((to) => {
        const a = ACTION[`${status}>${to}`]!;
        return (
          <Button key={to} variant={a.variant} onClick={() => openStatus(to)}>
            <a.icon />
            {t(`actions.${a.key}`)}
          </Button>
        );
      })}
      {canUpdate && (
        <>
          <Link href={`/admin/members/${memberId}/edit`} className={buttonVariants({ variant: "outline" })}>
            <Pencil />
            {tc("actions.edit")}
          </Link>
          <Button variant="outline" onClick={() => setDialog("photo")}>
            <Camera />
            <span className="sr-only sm:not-sr-only">{t("actions.replacePhoto")}</span>
          </Button>
        </>
      )}
      {canDelete && (
        <Button variant="ghost" className="text-destructive" onClick={() => setDialog("delete")} aria-label={tc("actions.delete")}>
          <Trash2 />
        </Button>
      )}

      <Dialog open={target !== null} onOpenChange={(o) => !o && setTarget(null)}>
        {active && target && (
          <DialogContent title={t(`actions.${active.key}Title`)} description={t(`actions.${active.key}Description`, { name: fullName })}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void changeStatus();
              }}
              className="space-y-4"
            >
              <Field
                label={NEEDS_REASON.includes(target) ? t("actions.reason") : t("actions.reasonOptional")}
                htmlFor="status-reason"
                required={NEEDS_REASON.includes(target)}
                error={reasonError}
                hint={target === "REJECTED" ? t("actions.reasonEmailed") : undefined}
              >
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} rows={3} />
              </Field>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setTarget(null)}>
                  {tc("actions.cancel")}
                </Button>
                <Button type="submit" variant={target === "REJECTED" || target === "SUSPENDED" ? "destructive" : "default"} loading={busy}>
                  {t(`actions.${active.key}`)}
                </Button>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={dialog === "photo"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title={t("actions.replacePhoto")} description={t("actions.replacePhotoDescription")}>
          <div className="space-y-4">
            <Field label={t("fields.photo")} htmlFor="replace-photo">
              <Input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialog(null)}>
                {tc("actions.cancel")}
              </Button>
              <Button onClick={uploadPhoto} disabled={!photo} loading={busy}>
                {tc("actions.upload")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t("actions.deleteTitle")}
        description={t("actions.deleteDescription", { name: fullName })}
        confirmLabel={tc("actions.delete")}
        cancelLabel={tc("actions.cancel")}
        destructive
        loading={busy}
        onConfirm={remove}
      />
    </>
  );
}
