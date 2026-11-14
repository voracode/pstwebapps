"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { CheckCircle2, Copy, ExternalLink, ImageIcon, Link2, Trash2, Upload, XCircle } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { api, ApiClientError, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-controls";
import { Alert, EmptyState } from "@/components/ui/primitives";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/overlays";
import { formatBytes, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils/cn";
import { MediaThumb } from "./media-picker";
import { ACCEPT_ALL, altFor, toRef, uploadMedia, type MediaItem } from "./media-types";
import { mapFieldErrors } from "./form-helpers";

const LANGS = ["tet", "pt", "id", "en"] as const;

interface QueueItem {
  key: string;
  name: string;
  pct: number;
  state: "uploading" | "done" | "error";
  error?: string;
}

export function MediaLibrary({ items, canWrite }: { items: MediaItem[]; canWrite: boolean }) {
  const t = useTranslations("cms");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [embedOpen, setEmbedOpen] = useState(false);
  const [active, setActive] = useState<MediaItem | null>(null);

  const patchQueue = (key: string, patch: Partial<QueueItem>) => setQueue((q) => q.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const uploadFiles = async (files: File[]) => {
    if (!files.length) return;
    const batch = files.map((f, i) => ({ key: `${Date.now()}-${i}-${f.name}`, name: f.name, pct: 0, state: "uploading" as const }));
    setQueue((q) => [...batch, ...q.filter((x) => x.state === "uploading")]);
    // Two at a time: fast enough, gentle on slow connections.
    let next = 0;
    let ok = 0;
    const worker = async () => {
      while (next < files.length) {
        const i = next++;
        const file = files[i]!;
        const key = batch[i]!.key;
        try {
          await uploadMedia(file, { onProgress: (pct) => patchQueue(key, { pct }) });
          patchQueue(key, { pct: 100, state: "done" });
          ok++;
        } catch (err) {
          patchQueue(key, { state: "error", error: errorMessage(err, tc) });
        }
      }
    };
    await Promise.all([worker(), worker()]);
    if (fileRef.current) fileRef.current.value = "";
    if (ok) {
      toast.success(t("media.uploaded", { count: ok }));
      router.refresh();
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!canWrite) return;
    uploadFiles(Array.from(e.dataTransfer.files));
  };

  return (
    <>
      {canWrite && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "mb-4 flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-6 text-center transition-colors",
            dragging ? "border-primary bg-primary/5" : "border-border bg-card",
          )}
        >
          <Upload className="size-8 text-muted-foreground" aria-hidden />
          <div>
            <p className="font-semibold">{t("media.dropTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("media.dropHint")}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={ACCEPT_ALL}
              className="sr-only"
              tabIndex={-1}
              aria-label={tc("actions.upload")}
              onChange={(e) => uploadFiles(Array.from(e.target.files ?? []))}
            />
            <Button type="button" onClick={() => fileRef.current?.click()}>
              <Upload aria-hidden />
              {t("media.chooseFiles")}
            </Button>
            <Button type="button" variant="outline" onClick={() => setEmbedOpen(true)}>
              <Link2 aria-hidden />
              {t("media.addVideo")}
            </Button>
          </div>
        </div>
      )}

      {queue.length > 0 && (
        <ul className="mb-4 space-y-2 rounded-lg border bg-card p-3" aria-live="polite">
          {queue.map((q) => (
            <li key={q.key} className="text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{q.name}</span>
                {q.state === "done" ? (
                  <CheckCircle2 className="size-4 shrink-0 text-green-600" aria-label={t("media.uploadDone")} />
                ) : q.state === "error" ? (
                  <XCircle className="size-4 shrink-0 text-destructive" aria-label={tc("errors.generic")} />
                ) : (
                  <span className="text-xs tabular-nums text-muted-foreground">{q.pct}%</span>
                )}
              </div>
              {q.state === "error" ? (
                <p className="text-xs text-destructive">{q.error}</p>
              ) : (
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full transition-all", q.state === "done" ? "bg-green-600" : "bg-primary")} style={{ width: `${q.pct}%` }} />
                </div>
              )}
            </li>
          ))}
          {queue.every((q) => q.state !== "uploading") && (
            <li className="flex justify-end">
              <Button size="sm" variant="ghost" onClick={() => setQueue([])}>
                {tc("actions.clear")}
              </Button>
            </li>
          )}
        </ul>
      )}

      {items.length === 0 ? (
        <EmptyState icon={ImageIcon} title={t("media.empty")} description={canWrite ? t("media.emptyHint") : undefined} />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {items.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => setActive(m)}
                className="group block w-full overflow-hidden rounded-lg border bg-card text-left shadow-sm transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <MediaThumb item={toRef(m)} alt={altFor(m, locale)} className="aspect-square w-full rounded-none" />
                <div className="space-y-0.5 p-2">
                  <p className="truncate text-xs font-medium">{m.originalName ?? m.url}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {t(`media.kinds.${m.kind}`)}
                    {m.sizeBytes ? ` · ${formatBytes(m.sizeBytes)}` : ""}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <EmbedDialog open={embedOpen} onOpenChange={setEmbedOpen} onDone={() => router.refresh()} />
      {active && <MediaItemDialog key={active.id} item={active} canWrite={canWrite} onClose={() => setActive(null)} />}
    </>
  );
}

function EmbedDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const t = useTranslations("cms");
  const tc = useTranslations("common");
  const [url, setUrl] = useState("");
  const [credit, setCredit] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/admin/media/embed", { url: url.trim(), credit: credit.trim() || undefined });
      toast.success(t("media.videoAdded"));
      setUrl("");
      setCredit("");
      onOpenChange(false);
      onDone();
    } catch (err) {
      setError(mapFieldErrors(err).url ?? errorMessage(err, tc));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t("media.addVideo")} description={t("media.addVideoHint")}>
        <form onSubmit={submit} className="space-y-4">
          <Field label={t("media.videoUrl")} htmlFor="embed-url" error={error} required>
            <Input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" required autoFocus />
          </Field>
          <Field label={t("media.credit")} htmlFor="embed-credit">
            <Input value={credit} onChange={(e) => setCredit(e.target.value)} maxLength={160} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc("actions.cancel")}
            </Button>
            <Button type="submit" loading={busy}>
              {tc("actions.add")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MediaItemDialog({ item, canWrite, onClose }: { item: MediaItem; canWrite: boolean; onClose: () => void }) {
  const t = useTranslations("cms");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const initialAlt = (item.altText as Record<string, string> | null) ?? {};
  const [alt, setAlt] = useState<Record<string, string>>(() => Object.fromEntries(LANGS.map((l) => [l, initialAlt[l] ?? ""])));
  const [credit, setCredit] = useState(item.credit ?? "");
  const [busy, setBusy] = useState<null | "save" | "delete">(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [inUse, setInUse] = useState<string | null>(null);

  const absoluteUrl = item.url ? new URL(item.url, typeof window === "undefined" ? "http://localhost" : window.location.origin).toString() : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      toast.success(tc("actions.copied"));
    } catch {
      toast.error(tc("errors.generic"));
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("save");
    try {
      const altText = Object.fromEntries(Object.entries(alt).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
      await api.patch(`/api/admin/media/${item.id}`, { altText, credit: credit.trim() || null });
      toast.success(tc("states.saved"));
      router.refresh();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, tc));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("delete");
    try {
      await api.delete(`/api/admin/media/${item.id}`);
      toast.success(t("media.deleted"));
      setConfirmDelete(false);
      router.refresh();
      onClose();
    } catch (err) {
      setConfirmDelete(false);
      if (err instanceof ApiClientError && err.status === 409) setInUse(t("media.inUse"));
      else toast.error(errorMessage(err, tc));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide title={item.originalName ?? t(`media.kinds.${item.kind}`)}>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-3">
            {item.kind === "IMAGE" && item.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.url} alt={altFor(item, locale)} className="max-h-80 w-full rounded-md border bg-muted object-contain" />
            ) : item.kind === "VIDEO" && item.url ? (
              <video src={item.url} controls preload="metadata" className="w-full rounded-md border" />
            ) : item.kind === "AUDIO" && item.url ? (
              <audio src={item.url} controls preload="metadata" className="w-full" />
            ) : (
              <MediaThumb item={toRef(item)} className="aspect-video w-full border" />
            )}
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <dt className="text-muted-foreground">{t("media.kind")}</dt>
              <dd>{t(`media.kinds.${item.kind}`)}</dd>
              {item.mimeType && (
                <>
                  <dt className="text-muted-foreground">{t("media.format")}</dt>
                  <dd className="break-all">{item.mimeType}</dd>
                </>
              )}
              {item.sizeBytes ? (
                <>
                  <dt className="text-muted-foreground">{t("media.size")}</dt>
                  <dd>{formatBytes(item.sizeBytes)}</dd>
                </>
              ) : null}
              {item.width && item.height ? (
                <>
                  <dt className="text-muted-foreground">{t("media.dimensions")}</dt>
                  <dd>
                    {item.width} × {item.height}
                  </dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">{t("media.uploadedAt")}</dt>
              <dd>{formatDateTime(item.createdAt, locale)}</dd>
              {item.uploadedBy && (
                <>
                  <dt className="text-muted-foreground">{t("media.uploadedBy")}</dt>
                  <dd>{item.uploadedBy.name}</dd>
                </>
              )}
            </dl>
            {item.url && (
              <div className="flex gap-2">
                <Input readOnly value={absoluteUrl} aria-label={t("media.url")} className="h-9 text-xs" onFocus={(e) => e.currentTarget.select()} />
                <Button type="button" size="icon-sm" variant="outline" className="size-9 shrink-0" onClick={copy} aria-label={t("media.copyUrl")} title={t("media.copyUrl")}>
                  <Copy aria-hidden />
                </Button>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border hover:bg-muted"
                  aria-label={tc("actions.open")}
                  title={tc("actions.open")}
                >
                  <ExternalLink className="size-4" aria-hidden />
                </a>
              </div>
            )}
          </div>

          <form onSubmit={save} className="space-y-3">
            {inUse && <Alert variant="warning">{inUse}</Alert>}
            <fieldset disabled={!canWrite} className="space-y-3">
              <p className="text-sm font-semibold">{t("media.altText")}</p>
              <p className="text-xs text-muted-foreground">{t("media.altHint")}</p>
              {LANGS.map((l) => (
                <Field key={l} label={tc(`langName.${l}`)} htmlFor={`alt-${l}`}>
                  <Input value={alt[l] ?? ""} maxLength={300} onChange={(e) => setAlt((a) => ({ ...a, [l]: e.target.value }))} />
                </Field>
              ))}
              <Field label={t("media.credit")} htmlFor="media-credit" hint={t("media.creditHint")}>
                <Input value={credit} maxLength={160} onChange={(e) => setCredit(e.target.value)} />
              </Field>
            </fieldset>
            {canWrite && (
              <div className="flex flex-wrap justify-between gap-2 pt-2">
                <Button type="button" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => setConfirmDelete(true)} disabled={!!busy}>
                  <Trash2 aria-hidden />
                  {tc("actions.delete")}
                </Button>
                <Button type="submit" loading={busy === "save"} disabled={!!busy}>
                  {tc("actions.save")}
                </Button>
              </div>
            )}
          </form>
        </div>
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={t("media.deleteTitle")}
          description={t("media.deleteDescription")}
          confirmLabel={tc("actions.delete")}
          cancelLabel={tc("actions.cancel")}
          destructive
          loading={busy === "delete"}
          onConfirm={remove}
        />
      </DialogContent>
    </Dialog>
  );
}
