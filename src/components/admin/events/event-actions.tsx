"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { api, errorMessage } from "@/lib/api-client";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/overlays";

export function EventActions({ eventId, title, attendanceCount }: { eventId: string; title: string; attendanceCount: number }) {
  const t = useTranslations("events");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    try {
      await api.delete(`/api/admin/events/${eventId}`);
      toast.success(t("deleted"));
      router.replace("/admin/events");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, tc));
      setBusy(false);
    }
  };

  return (
    <>
      <Link href={`/admin/events/${eventId}/edit`} className={buttonVariants({ variant: "outline" })}>
        <Pencil />
        {tc("actions.edit")}
      </Link>
      <Button variant="ghost" className="text-destructive" onClick={() => setOpen(true)} aria-label={tc("actions.delete")}>
        <Trash2 />
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("deleteTitle")}
        description={t("deleteDescription", { title, count: attendanceCount })}
        confirmLabel={tc("actions.delete")}
        cancelLabel={tc("actions.cancel")}
        destructive
        loading={busy}
        onConfirm={remove}
      />
    </>
  );
}
