"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Images, MessageSquareText, Plus, Trash2, Upload, X } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { api, ApiClientError, errorMessage } from "@/lib/api-client";
import { TranslationTabs } from "@/components/admin/translation-tabs";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form-controls";
import { Alert, Badge, EmptyState, Skeleton } from "@/components/ui/primitives";
import { ConfirmDialog, Dialog, DialogContent, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { MediaField, MediaPicker, MediaThumb } from "@/components/admin/cms/media-picker";
import type { MediaKindValue, MediaRef } from "@/components/admin/cms/media-types";
import { PublishStatusBadge, type PublishStatusValue } from "@/components/admin/cms/status-badge";
import { byLocale, fromRows, mapFieldErrors, pickRow, translationPayload, type ByLocale } from "@/components/admin/cms/form-helpers";
import { formatDate } from "@/lib/format";
import { moveItem } from "./order-buttons";

const LANGS = ["tet", "pt", "id", "en"] as const;

export interface AlbumRow {
  id: string;
  slug: string;
  status: PublishStatusValue;
  publishedAt: string | null;
  coverId: string | null;
  coverUrl: string | null;
  itemCount: number;
  translations: { locale: string; title: string; description: string | null }[];
}

interface AlbumDetail {
  id: string;
  slug: string;
  status: PublishStatusValue;
  coverId: string | null;
  cover: { url: string } | null;
  translations: { locale: string; title: string; description: string | null }[];
  items: { mediaId: string; caption: Record<string, string> | null; media: { id: string; kind: MediaKindValue; url: string | null; originalName: string | null } }[];
}

export function AlbumsManager({ albums, canWrite, canPublish }: { albums: AlbumRow[]; canWrite: boolean; canPublish: boolean }) {
  const t = useTranslations("cms");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t("albums.description")}</p>
        {canWrite && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            {t("albums.new")}
          </Button>
        )}
      </div>
      {albums.length === 0 ? (
        <EmptyState icon={Images} title={t("albums.empty")} description={canWrite ? t("albums.emptyHint") : undefined} />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {albums.map((a) => {
            const tr = pickRow(a.translations, locale);
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(a.id)}
                  className="block w-full overflow-hidden rounded-lg border bg-card text-left shadow-sm transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <MediaThumb item={{ kind: "IMAGE", url: a.coverUrl }} className="aspect-video w-full rounded-none" />
                  <div className="space-y-1 p-3">
                    <p className="line-clamp-2 font-semibold">{tr?.title ?? a.slug}</p>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <PublishStatusBadge status={a.status} label={tc(`enums.publishStatus.${a.status}`)} />
                      <span>{t("albums.itemCount", { count: a.itemCount })}</span>
                      {a.publishedAt && <span>· {formatDate(a.publishedAt, locale)}</span>}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {creating && (
        <AlbumCreateDialog
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            router.refresh();
            setOpenId(id);
          }}
        />
      )}
      {openId && (
        <AlbumDialog
          key={openId}
          id={openId}
          canWrite={canWrite}
          canPublish={canPublish}
          onClose={() => setOpenId(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </div>
  );
}

interface AlbumTr {
  title: string;
  description: string;
}

function AlbumFields({ tr, setTr, errors }: { tr: ByLocale<AlbumTr>; setTr: React.Dispatch<React.SetStateAction<ByLocale<AlbumTr>>>; errors: Record<string, string> }) {
  const t = useTranslations("cms");
  return (
    <TranslationTabs filled={byLocale((l) => !!tr[l].title.trim())}>
      {(l) => (
        <div className="space-y-4 pt-2">
          <Field label={t("albums.titleField")} htmlFor={`alb-title-${l}`} required={l === "TET"} error={errors[`${l}.title`]}>
            <Input value={tr[l].title} maxLength={220} onChange={(e) => setTr((s) => ({ ...s, [l]: { ...s[l], title: e.target.value } }))} />
          </Field>
          <Field label={t("albums.descriptionField")} htmlFor={`alb-desc-${l}`} error={errors[`${l}.description`]}>
            <Textarea value={tr[l].description} maxLength={2000} rows={3} onChange={(e) => setTr((s) => ({ ...s, [l]: { ...s[l], description: e.target.value } }))} />
          </Field>
        </div>
      )}
    </TranslationTabs>
  );
}

function AlbumCreateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const t = useTranslations("cms");
  const tc = useTranslations("common");
  const [tr, setTr] = useState<ByLocale<AlbumTr>>(() => byLocale(() => ({ title: "", description: "" })));
  const [cover, setCover] = useState<MediaRef | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { sent, translations } = translationPayload(tr, (v) => !!v.title.trim(), (l, v) => ({ locale: l, title: v.title.trim(), description: v.description }));
    if (!sent.length) {
      setErrors({ "TET.title": t("albums.titleRequired") });
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      const a = await api.post<{ id: string }>("/api/admin/site/albums", { coverId: cover?.id, translations });
      toast.success(t("albums.created"));
      onCreated(a.id);
    } catch (err) {
      setErrors(mapFieldErrors(err, sent));
      toast.error(errorMessage(err, tc));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide title={t("albums.new")}>
        <form onSubmit={submit} className="space-y-5">
          <AlbumFields tr={tr} setTr={setTr} errors={errors} />
          <div className="max-w-xs">
            <MediaField id="alb-cover-new" label={t("albums.cover")} value={cover} onChange={setCover} error={errors.coverId} />
          </div>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              {tc("actions.cancel")}
            </Button>
            <Button type="submit" loading={busy}>
              {tc("actions.create")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Item = AlbumDetail["items"][number];

function AlbumDialog({
  id,
  canWrite,
  canPublish,
  onClose,
  onChanged,
}: {
  id: string;
  canWrite: boolean;
  canPublish: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useTranslations("cms");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tr, setTr] = useState<ByLocale<AlbumTr>>(() => byLocale(() => ({ title: "", description: "" })));
  const [cover, setCover] = useState<MediaRef | null>(null);
  const [slug, setSlug] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [itemsDirty, setItemsDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<null | "details" | "items" | "status" | "delete">(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [captionFor, setCaptionFor] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const apply = useCallback((a: AlbumDetail) => {
    setAlbum(a);
    setTr(fromRows(a.translations, () => ({ title: "", description: "" }), (r) => ({ title: r.title, description: r.description ?? "" })));
    setCover(a.coverId ? { id: a.coverId, url: a.cover?.url ?? null, kind: "IMAGE" } : null);
    setSlug(a.slug);
    setItems(a.items);
    setItemsDirty(false);
  }, []);

  useEffect(() => {
    api
      .get<AlbumDetail>(`/api/admin/site/albums/${id}`)
      .then(apply)
      .catch((err) => setLoadError(errorMessage(err, tc)));
  }, [id, apply, tc]);

  const saveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!album) return;
    const { sent, translations, removeLocales } = translationPayload(
      tr,
      (v) => !!v.title.trim(),
      (l, v) => ({ locale: l, title: v.title.trim(), description: v.description }),
      album.translations.map((x) => x.locale),
    );
    if (!sent.length) {
      setErrors({ "TET.title": t("albums.titleRequired") });
      return;
    }
    setBusy("details");
    setErrors({});
    try {
      apply(await api.patch<AlbumDetail>(`/api/admin/site/albums/${id}`, { slug: slug.trim() || undefined, coverId: cover?.id ?? null, translations, removeLocales }));
      toast.success(tc("states.saved"));
      onChanged();
    } catch (err) {
      setErrors(mapFieldErrors(err, sent));
      toast.error(errorMessage(err, tc));
    } finally {
      setBusy(null);
    }
  };

  const saveItems = async () => {
    setBusy("items");
    try {
      apply(
        await api.put<AlbumDetail>(`/api/admin/site/albums/${id}/items`, {
          items: items.map((it) => ({ mediaId: it.mediaId, caption: it.caption ?? undefined })),
        }),
      );
      toast.success(tc("states.saved"));
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, tc));
    } finally {
      setBusy(null);
    }
  };

  const setStatus = async (status: "DRAFT" | "PUBLISHED" | "ARCHIVED") => {
    setBusy("status");
    try {
      if (itemsDirty) await api.put(`/api/admin/site/albums/${id}/items`, { items: items.map((it) => ({ mediaId: it.mediaId, caption: it.caption ?? undefined })) });
      apply(await api.patch<AlbumDetail>(`/api/admin/site/albums/${id}`, { status }));
      toast.success(t(`albums.status.${status}`));
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiClientError && err.status === 403 ? tc("errors.forbidden") : errorMessage(err, tc));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("delete");
    try {
      await api.delete(`/api/admin/site/albums/${id}`);
      toast.success(t("albums.deleted"));
      onChanged();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, tc));
      setBusy(null);
    }
  };

  const updateItems = (next: Item[]) => {
    setItems(next);
    setItemsDirty(true);
  };

  const title = album ? pickRow(album.translations, locale)?.title ?? album.slug : t("albums.title");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide title={title}>
        {loadError ? (
          <Alert variant="error">{loadError}</Alert>
        ) : !album ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <PublishStatusBadge status={album.status} label={tc(`enums.publishStatus.${album.status}`)} />
              {canPublish && album.status !== "PUBLISHED" && (
                <Button size="sm" variant="gold" onClick={() => setStatus("PUBLISHED")} loading={busy === "status"} disabled={!!busy || items.length === 0}>
                  <Upload aria-hidden />
                  {t("albums.publish")}
                </Button>
              )}
              {canPublish && album.status === "PUBLISHED" && (
                <Button size="sm" variant="outline" onClick={() => setStatus("DRAFT")} loading={busy === "status"} disabled={!!busy}>
                  {t("albums.unpublish")}
                </Button>
              )}
              {canPublish && album.status !== "ARCHIVED" && (
                <Button size="sm" variant="ghost" onClick={() => setStatus("ARCHIVED")} disabled={!!busy}>
                  {t("albums.archive")}
                </Button>
              )}
              {canPublish && album.status !== "PUBLISHED" && items.length === 0 && <span className="text-xs text-muted-foreground">{t("albums.publishNeedsItems")}</span>}
            </div>

            <Tabs defaultValue="photos">
              <TabsList>
                <TabsTrigger value="photos">
                  {t("albums.photos")} <Badge variant="muted">{items.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="details">{t("albums.details")}</TabsTrigger>
              </TabsList>

              <TabsContent value="photos" className="space-y-3">
                {canWrite && (
                  <div className="flex flex-wrap justify-between gap-2">
                    <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
                      <Plus aria-hidden />
                      {t("albums.addItems")}
                    </Button>
                    <Button size="sm" onClick={saveItems} loading={busy === "items"} disabled={!itemsDirty || !!busy}>
                      {t("albums.saveOrder")}
                    </Button>
                  </div>
                )}
                {itemsDirty && <Alert variant="warning">{t("albums.unsavedItems")}</Alert>}
                {items.length === 0 ? (
                  <EmptyState icon={Images} title={t("albums.noItems")} />
                ) : (
                  <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {items.map((it, i) => (
                      <li key={it.mediaId} className="overflow-hidden rounded-md border bg-card">
                        <MediaThumb item={{ kind: it.media.kind, url: it.media.url }} className="aspect-square w-full rounded-none" />
                        {it.caption?.[locale] || it.caption?.tet ? (
                          <p className="line-clamp-2 px-2 pt-1 text-xs text-muted-foreground">{it.caption?.[locale] || it.caption?.tet}</p>
                        ) : null}
                        {canWrite && (
                          <div className="flex items-center justify-between p-1">
                            <div className="flex">
                              <Button size="icon-sm" variant="ghost" disabled={i === 0} onClick={() => updateItems(moveItem(items, i, -1))} aria-label={t("albums.moveLeft")}>
                                <ArrowLeft aria-hidden />
                              </Button>
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                disabled={i === items.length - 1}
                                onClick={() => updateItems(moveItem(items, i, 1))}
                                aria-label={t("albums.moveRight")}
                              >
                                <ArrowRight aria-hidden />
                              </Button>
                            </div>
                            <div className="flex">
                              <Button size="icon-sm" variant="ghost" onClick={() => setCaptionFor(i)} aria-label={t("albums.caption")}>
                                <MessageSquareText aria-hidden />
                              </Button>
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                className="text-destructive"
                                onClick={() => updateItems(items.filter((_, j) => j !== i))}
                                aria-label={t("albums.removeItem")}
                              >
                                <X aria-hidden />
                              </Button>
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </TabsContent>

              <TabsContent value="details">
                <form onSubmit={saveDetails} className="space-y-5">
                  <fieldset disabled={!canWrite} className="space-y-5">
                    <AlbumFields tr={tr} setTr={setTr} errors={errors} />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <MediaField id="alb-cover" label={t("albums.cover")} value={cover} onChange={setCover} error={errors.coverId} hint={t("albums.coverHint")} />
                      <Field label={t("albums.slug")} htmlFor="alb-slug" hint={t("albums.slugHint")} error={errors.slug}>
                        <Input value={slug} maxLength={160} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))} />
                      </Field>
                    </div>
                  </fieldset>
                  {canWrite && (
                    <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
                      <Button type="button" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => setConfirmDelete(true)} disabled={!!busy}>
                        <Trash2 aria-hidden />
                        {t("albums.delete")}
                      </Button>
                      <Button type="submit" loading={busy === "details"} disabled={!!busy}>
                        {tc("actions.save")}
                      </Button>
                    </div>
                  )}
                </form>
              </TabsContent>
            </Tabs>

            <MediaPicker
              open={pickerOpen}
              onOpenChange={setPickerOpen}
              kinds={["IMAGE", "VIDEO_EMBED"]}
              multiple
              title={t("albums.addItems")}
              onSelect={(picked) => {
                const existing = new Set(items.map((x) => x.mediaId));
                const add = picked
                  .filter((m) => !existing.has(m.id))
                  .map((m) => ({ mediaId: m.id, caption: null, media: { id: m.id, kind: m.kind, url: m.url, originalName: m.originalName } }));
                if (add.length) updateItems([...items, ...add]);
              }}
            />
            {captionFor !== null && items[captionFor] && (
              <CaptionDialog
                initial={items[captionFor]!.caption ?? {}}
                onClose={() => setCaptionFor(null)}
                onSave={(caption) => {
                  updateItems(items.map((x, j) => (j === captionFor ? { ...x, caption } : x)));
                  setCaptionFor(null);
                }}
              />
            )}
            <ConfirmDialog
              open={confirmDelete}
              onOpenChange={setConfirmDelete}
              title={t("albums.deleteTitle")}
              description={t("albums.deleteDescription")}
              confirmLabel={tc("actions.delete")}
              cancelLabel={tc("actions.cancel")}
              destructive
              loading={busy === "delete"}
              onConfirm={remove}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CaptionDialog({ initial, onClose, onSave }: { initial: Record<string, string>; onClose: () => void; onSave: (c: Record<string, string> | null) => void }) {
  const t = useTranslations("cms");
  const tc = useTranslations("common");
  const [c, setC] = useState<Record<string, string>>(() => Object.fromEntries(LANGS.map((l) => [l, initial[l] ?? ""])));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t("albums.caption")}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const clean = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
            onSave(Object.keys(clean).length ? clean : null);
          }}
          className="space-y-3"
        >
          {LANGS.map((l) => (
            <Field key={l} label={tc(`langName.${l}`)} htmlFor={`cap-${l}`}>
              <Input value={c[l] ?? ""} maxLength={300} onChange={(e) => setC((s) => ({ ...s, [l]: e.target.value }))} />
            </Field>
          ))}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {tc("actions.cancel")}
            </Button>
            <Button type="submit">{tc("actions.confirm")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
