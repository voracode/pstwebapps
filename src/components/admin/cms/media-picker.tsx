"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, FileText, Film, ImageIcon, Link2, Music, Search, Upload, X } from "lucide-react";
import { api, ApiClientError, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect } from "@/components/ui/form-controls";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils/cn";
import { ACCEPT, altFor, thumbFor, toRef, uploadMedia, type MediaItem, type MediaKindValue, type MediaRef } from "./media-types";

const PAGE_SIZE = 24;

export function KindIcon({ kind, className }: { kind?: MediaKindValue; className?: string }) {
  const Icon = kind === "DOCUMENT" ? FileText : kind === "VIDEO" || kind === "VIDEO_EMBED" ? Film : kind === "AUDIO" ? Music : ImageIcon;
  return <Icon className={className} aria-hidden />;
}

/** Square preview for a library item (image, video thumbnail or file icon). */
export function MediaThumb({ item, className, alt = "" }: { item: { kind?: MediaKindValue; url: string | null; name?: string | null }; className?: string; alt?: string }) {
  const src = thumbFor(item);
  return (
    <div className={cn("relative flex items-center justify-center overflow-hidden rounded-md bg-muted", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} loading="lazy" className="size-full object-cover" />
      ) : (
        <KindIcon kind={item.kind} className="size-8 text-muted-foreground" />
      )}
      {item.kind === "VIDEO_EMBED" && src && (
        <span className="absolute bottom-1 right-1 rounded bg-black/70 p-1 text-white">
          <Film className="size-3" aria-hidden />
        </span>
      )}
    </div>
  );
}

/**
 * Dialog to pick (or upload) items from the media library.
 *
 *   <MediaPicker open={o} onOpenChange={setO} kinds={["IMAGE"]} onSelect={([m]) => setCover(toRef(m))} />
 */
export function MediaPicker({
  open,
  onOpenChange,
  kinds = ["IMAGE"],
  multiple = false,
  onSelect,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kinds?: MediaKindValue[];
  multiple?: boolean;
  onSelect: (items: MediaItem[]) => void;
  title?: string;
}) {
  const t = useTranslations("cms");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [kind, setKind] = useState<MediaKindValue>(kinds[0] ?? "IMAGE");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MediaItem[]>([]);
  const [uploading, setUploading] = useState<{ name: string; pct: number } | null>(null);
  const [embedUrl, setEmbedUrl] = useState("");
  const [embedBusy, setEmbedBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Reset when (re)opened.
  useEffect(() => {
    if (open) {
      setSelected([]);
      setKind(kinds[0] ?? "IMAGE");
      setQ("");
      setQuery("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Debounced search.
  useEffect(() => {
    const id = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);

  const load = useCallback(
    async (p: number, append: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const sp = new URLSearchParams({ kind, page: String(p), pageSize: String(PAGE_SIZE) });
        if (query) sp.set("q", query);
        const res = await api.get<{ items: MediaItem[]; meta: { pageCount: number } }>(`/api/admin/media?${sp}`);
        setItems((prev) => (append ? [...prev, ...res.items] : res.items));
        setPage(p);
        setPageCount(res.meta.pageCount);
      } catch (err) {
        setError(err instanceof ApiClientError && err.status === 403 ? tc("errors.forbidden") : errorMessage(err, tc));
      } finally {
        setLoading(false);
      }
    },
    [kind, query, tc],
  );

  useEffect(() => {
    if (open) load(1, false);
  }, [open, load]);

  const toggle = (m: MediaItem) => {
    setSelected((prev) => {
      if (prev.some((s) => s.id === m.id)) return prev.filter((s) => s.id !== m.id);
      return multiple ? [...prev, m] : [m];
    });
  };

  const confirm = (list = selected) => {
    if (!list.length) return;
    onSelect(list);
    onOpenChange(false);
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const uploaded: MediaItem[] = [];
    for (const file of Array.from(files)) {
      setUploading({ name: file.name, pct: 0 });
      try {
        const m = await uploadMedia(file, { onProgress: (pct) => setUploading({ name: file.name, pct }) });
        uploaded.push(m);
      } catch (err) {
        toast.error(`${file.name}: ${errorMessage(err, tc)}`);
      }
    }
    setUploading(null);
    if (fileRef.current) fileRef.current.value = "";
    if (!uploaded.length) return;
    toast.success(t("media.uploaded", { count: uploaded.length }));
    const matching = uploaded.filter((m) => m.kind === kind);
    setItems((prev) => [...matching, ...prev]);
    setSelected((prev) => (multiple ? [...prev, ...matching] : matching.slice(-1)));
  };

  const addEmbed = async () => {
    if (!embedUrl.trim()) return;
    setEmbedBusy(true);
    try {
      const m = await api.post<MediaItem>("/api/admin/media/embed", { url: embedUrl.trim() });
      setEmbedUrl("");
      setItems((prev) => [m, ...prev]);
      setSelected((prev) => (multiple ? [...prev, m] : [m]));
    } catch (err) {
      toast.error(errorMessage(err, tc));
    } finally {
      setEmbedBusy(false);
    }
  };

  const canUpload = kind !== "VIDEO_EMBED";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide title={title ?? (multiple ? t("picker.titleMany") : t("picker.title"))} description={t("picker.description")}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="relative flex-1">
            <Label htmlFor="picker-q" className="sr-only">
              {tc("actions.search")}
            </Label>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id="picker-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("media.searchPlaceholder")} className="pl-9" />
          </div>
          {kinds.length > 1 && (
            <div className="sm:w-48">
              <Label htmlFor="picker-kind" className="sr-only">
                {t("media.kind")}
              </Label>
              <NativeSelect id="picker-kind" value={kind} onChange={(e) => setKind(e.target.value as MediaKindValue)}>
                {kinds.map((k) => (
                  <option key={k} value={k}>
                    {t(`media.kinds.${k}`)}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
          {canUpload && (
            <>
              <input
                ref={fileRef}
                type="file"
                className="sr-only"
                accept={ACCEPT[kind]}
                multiple={multiple}
                onChange={(e) => onFiles(e.target.files)}
                aria-label={tc("actions.upload")}
                tabIndex={-1}
              />
              <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} loading={!!uploading}>
                <Upload aria-hidden />
                {tc("actions.upload")}
              </Button>
            </>
          )}
        </div>

        {kind === "VIDEO_EMBED" && (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Label htmlFor="picker-embed" className="sr-only">
              {t("media.videoUrl")}
            </Label>
            <Input
              id="picker-embed"
              type="url"
              inputMode="url"
              value={embedUrl}
              onChange={(e) => setEmbedUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=…"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addEmbed();
                }
              }}
            />
            <Button type="button" variant="outline" onClick={addEmbed} loading={embedBusy} disabled={!embedUrl.trim()}>
              <Link2 aria-hidden />
              {t("media.addVideo")}
            </Button>
          </div>
        )}

        {uploading && (
          <div className="mt-3 space-y-1" role="status">
            <p className="truncate text-xs text-muted-foreground">
              {uploading.name} · {uploading.pct}%
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${uploading.pct}%` }} />
            </div>
          </div>
        )}

        <div className="mt-4 min-h-48">
          {error ? (
            <p className="rounded-md border border-destructive/40 p-4 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : !loading && items.length === 0 ? (
            <EmptyState icon={ImageIcon} title={query ? tc("states.noResults") : t("media.empty")} description={canUpload ? t("picker.emptyHint") : undefined} />
          ) : (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {items.map((m) => {
                const isSel = selected.some((s) => s.id === m.id);
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => toggle(m)}
                      onDoubleClick={() => !multiple && confirm([m])}
                      aria-pressed={isSel}
                      title={m.originalName ?? m.url ?? ""}
                      className={cn(
                        "group relative block w-full overflow-hidden rounded-md border-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        isSel ? "border-primary" : "border-transparent hover:border-border",
                      )}
                    >
                      <MediaThumb item={toRef(m)} alt={altFor(m, locale)} className="aspect-square w-full" />
                      {isSel && (
                        <span className="absolute right-1 top-1 rounded-full bg-primary p-0.5 text-primary-foreground">
                          <Check className="size-3.5" aria-hidden />
                        </span>
                      )}
                      {m.kind !== "IMAGE" && (
                        <span className="block truncate px-1 py-0.5 text-[11px] text-muted-foreground">
                          {m.originalName ?? m.url} {m.sizeBytes ? `· ${formatBytes(m.sizeBytes)}` : ""}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
              {loading &&
                Array.from({ length: items.length ? 6 : 12 }).map((_, i) => (
                  <li key={`s${i}`}>
                    <Skeleton className="aspect-square w-full" />
                  </li>
                ))}
            </ul>
          )}
          {page < pageCount && !loading && (
            <div className="mt-3 flex justify-center">
              <Button type="button" variant="ghost" size="sm" onClick={() => load(page + 1, true)}>
                {t("picker.loadMore")}
              </Button>
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t pt-4">
          <p className="text-sm text-muted-foreground">{t("picker.selected", { count: selected.length })}</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc("actions.cancel")}
            </Button>
            <Button type="button" onClick={() => confirm()} disabled={!selected.length}>
              {t("picker.use")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Form control: preview of the chosen item + choose/remove buttons.
 * Keeps a `MediaRef` (id + url) in the parent's state.
 */
export function MediaField({
  id,
  label,
  value,
  onChange,
  kinds = ["IMAGE"],
  hint,
  error,
  aspect = "aspect-video",
}: {
  id: string;
  label: string;
  value: MediaRef | null;
  onChange: (v: MediaRef | null) => void;
  kinds?: MediaKindValue[];
  hint?: string;
  error?: string | null;
  aspect?: string;
}) {
  const t = useTranslations("cms");
  const [open, setOpen] = useState(false);
  const isImage = (value?.kind ?? kinds[0]) === "IMAGE";
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {value ? (
        <div className="space-y-2">
          {isImage ? (
            <MediaThumb item={value} className={cn("w-full border", aspect)} />
          ) : (
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2 text-sm">
              <KindIcon kind={value.kind ?? kinds[0]} className="size-5 shrink-0 text-muted-foreground" />
              {value.url ? (
                <a href={value.url} target="_blank" rel="noreferrer" className="min-w-0 truncate underline-offset-2 hover:underline">
                  {value.name ?? value.url}
                </a>
              ) : (
                <span className="truncate">{value.name ?? value.id}</span>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <Button id={id} type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
              {t("picker.change")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)}>
              <X aria-hidden />
              {t("picker.remove")}
            </Button>
          </div>
        </div>
      ) : (
        <button
          id={id}
          type="button"
          onClick={() => setOpen(true)}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed p-4 text-sm text-muted-foreground hover:border-ring hover:text-foreground",
            isImage && aspect,
            error && "border-destructive",
          )}
        >
          <KindIcon kind={kinds[0]} className="size-6" />
          {t("picker.choose")}
        </button>
      )}
      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <MediaPicker open={open} onOpenChange={setOpen} kinds={kinds} onSelect={([m]) => m && onChange(toRef(m))} />
    </div>
  );
}
