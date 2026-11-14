"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { api, errorMessage } from "@/lib/api-client";
import { Label, NativeSelect } from "@/components/ui/form-controls";
import { Spinner } from "@/components/ui/primitives";
import { TICKET_PRIORITIES, TICKET_STATUSES } from "@/lib/validation/content";

type Patch = { status?: string; priority?: string; assignedToId?: string | null };

/** Status / priority / assignee — each change is saved immediately. */
export function AspirationControls({
  id,
  status,
  priority,
  assignedTo,
  users,
  currentUserId,
}: {
  id: string;
  status: string;
  priority: string;
  assignedTo: { id: string; name: string } | null;
  users: { id: string; name: string; municipality: string | null }[];
  currentUserId: string;
}) {
  const t = useTranslations("aspirations");
  const tc = useTranslations("common");
  const router = useRouter();
  const [values, setValues] = useState({ status, priority, assignedToId: assignedTo?.id ?? "" });
  const [saving, setSaving] = useState<keyof Patch | null>(null);

  const save = async (key: keyof Patch, value: string) => {
    const prev = values;
    setValues((v) => ({ ...v, [key]: value }));
    setSaving(key);
    try {
      await api.patch(`/api/admin/aspirations/${id}`, { [key]: key === "assignedToId" ? value || null : value } satisfies Patch);
      toast.success(tc("states.saved"));
      router.refresh();
    } catch (err) {
      setValues(prev);
      toast.error(errorMessage(err, tc));
    } finally {
      setSaving(null);
    }
  };

  // Keep the current assignee selectable even if no longer in the assignable list.
  const options = assignedTo && !users.some((u) => u.id === assignedTo.id) ? [{ id: assignedTo.id, name: assignedTo.name, municipality: null }, ...users] : users;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="asp-status" className="flex items-center gap-2">
          {t("fields.status")}
          {saving === "status" && <Spinner />}
        </Label>
        <NativeSelect id="asp-status" value={values.status} disabled={!!saving} onChange={(e) => save("status", e.target.value)}>
          {TICKET_STATUSES.map((s) => (
            <option key={s} value={s}>
              {tc(`enums.ticketStatus.${s}`)}
            </option>
          ))}
        </NativeSelect>
        {values.status !== "SPAM" && <p className="text-xs text-muted-foreground">{t("controls.statusEmailed")}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="asp-priority" className="flex items-center gap-2">
          {t("fields.priority")}
          {saving === "priority" && <Spinner />}
        </Label>
        <NativeSelect id="asp-priority" value={values.priority} disabled={!!saving} onChange={(e) => save("priority", e.target.value)}>
          {TICKET_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {tc(`enums.ticketPriority.${p}`)}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="asp-assignee" className="flex items-center gap-2">
          {t("fields.assignedTo")}
          {saving === "assignedToId" && <Spinner />}
        </Label>
        <NativeSelect id="asp-assignee" value={values.assignedToId} disabled={!!saving} onChange={(e) => save("assignedToId", e.target.value)}>
          <option value="">{t("controls.unassigned")}</option>
          {options.map((u) => (
            <option key={u.id} value={u.id}>
              {u.id === currentUserId ? t("controls.me", { name: u.name }) : u.name}
              {u.municipality ? ` · ${u.municipality}` : ""}
            </option>
          ))}
        </NativeSelect>
      </div>
    </div>
  );
}
