"use client";

import { useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Globe, Lock, Send } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { api, ApiClientError, errorMessage } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form-controls";
import { Alert, Badge } from "@/components/ui/primitives";
import { Switch } from "@/components/ui/overlays";
import { cn } from "@/lib/utils/cn";

export interface Note {
  id: string;
  body: string;
  isPublic: boolean;
  createdAt: Date | string;
  author: { id: string; name: string } | null;
}

export function NotesThread({ aspirationId, notes, canManage, citizenEmail }: { aspirationId: string; notes: Note[]; canManage: boolean; citizenEmail: boolean }) {
  const t = useTranslations("aspirations.notes");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [body, setBody] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (body.trim().length < 2) {
      setError(t("tooShort"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/admin/aspirations/${aspirationId}/notes`, { body: body.trim(), isPublic });
      toast.success(isPublic ? t("replySent") : t("noteAdded"));
      setBody("");
      setIsPublic(false);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.fieldErrors.body) setError(err.fieldErrors.body);
      toast.error(errorMessage(err, tc));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ol className="space-y-3">
          {notes.map((n) => (
            <li
              key={n.id}
              className={cn(
                "rounded-lg border p-3",
                n.isPublic ? "border-sky-300 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/40" : "bg-muted/40",
              )}
            >
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold">{n.author?.name ?? "—"}</span>
                <span className="flex items-center gap-2 text-muted-foreground">
                  {n.isPublic ? (
                    <Badge variant="info">
                      <Globe className="size-3" aria-hidden />
                      {t("public")}
                    </Badge>
                  ) : (
                    <Badge variant="muted">
                      <Lock className="size-3" aria-hidden />
                      {t("internal")}
                    </Badge>
                  )}
                  {formatDateTime(n.createdAt, locale)}
                </span>
              </div>
              <p className="whitespace-pre-line break-words text-sm">{n.body}</p>
            </li>
          ))}
        </ol>
      )}

      {canManage && (
        <form onSubmit={submit} className="space-y-3 border-t pt-4">
          <Field label={isPublic ? t("replyLabel") : t("noteLabel")} htmlFor="note-body" error={error}>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={5000} placeholder={isPublic ? t("replyPlaceholder") : t("notePlaceholder")} />
          </Field>
          <label htmlFor="note-public" className="flex cursor-pointer items-center gap-3 text-sm font-medium">
            <Switch id="note-public" checked={isPublic} onCheckedChange={setIsPublic} />
            {t("publicToggle")}
          </label>
          {isPublic && <Alert variant="info">{citizenEmail ? t("publicHintEmail") : t("publicHintNoEmail")}</Alert>}
          <div className="flex justify-end">
            <Button type="submit" loading={busy} variant={isPublic ? "default" : "dark"}>
              <Send />
              {isPublic ? t("sendReply") : t("addNote")}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
