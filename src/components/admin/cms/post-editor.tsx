"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import type { JSONContent } from "@tiptap/react";
import { Archive, CalendarClock, ExternalLink, Eye, EyeOff, Save, Send, Trash2, Upload } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { api, ApiClientError, errorMessage } from "@/lib/api-client";
import { TranslationTabs, type EditLocale } from "@/components/admin/translation-tabs";
import { Button } from "@/components/ui/button";
import { Field, Input, Label, NativeSelect, Textarea } from "@/components/ui/form-controls";
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { ConfirmDialog, Dialog, DialogContent, Switch } from "@/components/ui/overlays";
import { formatDateTime } from "@/lib/format";
import { byLocale, fromRows, mapFieldErrors, pickRow, toDiliInput, fromDiliInput, translationPayload, type ByLocale } from "./form-helpers";
import { MediaField } from "./media-picker";
import type { MediaRef } from "./media-types";
import { RichTextEditor } from "./rich-text-editor";
import { PublishStatusBadge, type PublishStatusValue } from "./status-badge";

const POST_TYPES = ["NEWS", "PRESS_RELEASE", "ARTICLE", "STATEMENT"] as const;
type PostTypeValue = (typeof POST_TYPES)[number];

export interface PostEditorData {
  id: string;
  type: PostTypeValue;
  status: PublishStatusValue;
  categoryId: string | null;
  municipalityId: number | null;
  cover: MediaRef | null;
  attachmentId: string | null;
  byline: string | null;
  isFeatured: boolean;
  pinnedToHero: boolean;
  tags: string[];
  publishedAt: string | null;
  scheduledAt: string | null;
  updatedAt: string;
  authorName: string | null;
  reviewerName: string | null;
  translations: {
    locale: string;
    title: string;
    slug: string;
    excerpt: string | null;
    contentJson: unknown;
    contentHtml: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
  }[];
}

interface TrState {
  title: string;
  slug: string;
  excerpt: string;
  seoTitle: string;
  seoDescription: string;
  contentJson: JSONContent | null;
  contentHtml: string;
}

const emptyTr = (): TrState => ({ title: "", slug: "", excerpt: "", seoTitle: "", seoDescription: "", contentJson: null, contentHtml: "" });

type WorkflowAction = "submit_review" | "publish" | "schedule" | "unpublish" | "archive";

export function PostEditor({
  post,
  categories,
  municipalities,
  documents,
  permissions,
}: {
  post: PostEditorData | null;
  categories: { id: string; name: string }[];
  municipalities: { id: number; name: string }[];
  documents: { id: string; title: string; type: string }[];
  permissions: { write: boolean; publish: boolean; delete: boolean };
}) {
  const t = useTranslations("cms");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const readOnly = !permissions.write;

  const [type, setType] = useState<PostTypeValue>(post?.type ?? "NEWS");
  const [categoryId, setCategoryId] = useState(post?.categoryId ?? "");
  const [municipalityId, setMunicipalityId] = useState(post?.municipalityId ? String(post.municipalityId) : "");
  const [cover, setCover] = useState<MediaRef | null>(post?.cover ?? null);
  const [attachmentId, setAttachmentId] = useState(post?.attachmentId ?? "");
  const [byline, setByline] = useState(post?.byline ?? "");
  const [tags, setTags] = useState((post?.tags ?? []).join(", "));
  const [isFeatured, setFeatured] = useState(post?.isFeatured ?? false);
  const [pinnedToHero, setPinned] = useState(post?.pinnedToHero ?? false);
  const [tr, setTr] = useState<ByLocale<TrState>>(() =>
    fromRows(post?.translations, emptyTr, (r) => ({
      title: r.title,
      slug: r.slug,
      excerpt: r.excerpt ?? "",
      seoTitle: r.seoTitle ?? "",
      seoDescription: r.seoDescription ?? "",
      contentJson: (r.contentJson as JSONContent | null) ?? null,
      contentHtml: r.contentHtml ?? "",
    })),
  );
  const initialContent = useMemo(
    () => byLocale((l) => {
      const row = post?.translations.find((x) => x.locale === l);
      return (row?.contentJson as JSONContent | null) ?? row?.contentHtml ?? null;
    }),
    // Editors are initialised once; later changes live in `tr`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<null | "save" | WorkflowAction | "delete">(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState(toDiliInput(post?.scheduledAt ?? null));
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const touch = () => setDirty(true);
  const setField = (l: EditLocale, patch: Partial<TrState>) => {
    setTr((s) => ({ ...s, [l]: { ...s[l], ...patch } }));
    touch();
  };

  const filled = byLocale((l) => !!tr[l].title.trim());
  const existing = post?.translations.map((x) => x.locale) ?? [];

  const save = async (): Promise<string | null> => {
    const { sent, translations, removeLocales } = translationPayload(
      tr,
      (v) => !!v.title.trim(),
      (l, v) => ({
        locale: l,
        title: v.title.trim(),
        slug: v.slug.trim() || undefined,
        excerpt: v.excerpt,
        contentJson: v.contentJson ?? undefined,
        contentHtml: v.contentHtml || undefined,
        seoTitle: v.seoTitle,
        seoDescription: v.seoDescription,
      }),
      existing,
    );
    if (!sent.length) {
      setErrors({ "TET.title": t("posts.titleRequired") });
      toast.error(t("posts.titleRequired"));
      return null;
    }
    const tagList = tags
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const body = {
      type,
      categoryId: categoryId || (post ? null : undefined),
      municipalityId: municipalityId ? Number(municipalityId) : post ? null : undefined,
      coverId: cover?.id ?? (post ? null : undefined),
      attachmentId: attachmentId || (post ? null : undefined),
      byline: byline.trim() || (post ? null : undefined),
      isFeatured,
      pinnedToHero,
      tags: tagList,
      translations,
      ...(post ? { removeLocales } : {}),
    };
    setErrors({});
    try {
      if (post) {
        await api.patch(`/api/admin/posts/${post.id}`, body);
        setDirty(false);
        router.refresh();
        return post.id;
      }
      const createdPost = await api.post<{ id: string }>("/api/admin/posts", body);
      setDirty(false);
      router.replace(`/admin/posts/${createdPost.id}`);
      return createdPost.id;
    } catch (err) {
      setErrors(mapFieldErrors(err, sent));
      toast.error(errorMessage(err, tc));
      return null;
    }
  };

  const onSave = async () => {
    setBusy("save");
    const id = await save();
    setBusy(null);
    if (id) toast.success(post ? tc("states.saved") : t("posts.created"));
  };

  const workflow = async (action: WorkflowAction, scheduledAt?: string) => {
    if (!post) return;
    setBusy(action);
    try {
      if (dirty && permissions.write) {
        const ok = await save();
        if (!ok) return;
      }
      await api.post(`/api/admin/posts/${post.id}/workflow`, action === "schedule" ? { action, scheduledAt } : { action });
      toast.success(t(`posts.workflowDone.${action}`));
      setScheduleOpen(false);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 403) toast.error(t("posts.noPublishPermission"));
      else toast.error(errorMessage(err, tc));
    } finally {
      setBusy(null);
    }
  };

  const onSchedule = () => {
    const iso = fromDiliInput(scheduleAt);
    if (!iso || new Date(iso) <= new Date()) {
      setScheduleError(t("posts.scheduleFuture"));
      return;
    }
    setScheduleError(null);
    workflow("schedule", iso);
  };

  const onDelete = async () => {
    if (!post) return;
    setBusy("delete");
    try {
      await api.delete(`/api/admin/posts/${post.id}`);
      toast.success(t("posts.deleted"));
      setDirty(false);
      router.replace("/admin/posts");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, tc));
      setBusy(null);
    }
  };

  const status = post?.status ?? "DRAFT";
  const previewRow = post ? pickRow(post.translations, locale) : undefined;
  const previewHref = post?.status === "PUBLISHED" && previewRow ? `/${previewRow.locale.toLowerCase()}/news/${previewRow.slug}` : null;

  const canSubmitReview = !!post && permissions.write && status === "DRAFT";
  const canPublish = !!post && permissions.publish && status !== "PUBLISHED";
  const canSchedule = !!post && permissions.publish && (status === "DRAFT" || status === "IN_REVIEW" || status === "SCHEDULED");
  const canUnpublish = !!post && permissions.publish && status !== "DRAFT";
  const canArchive = !!post && permissions.publish && status !== "ARCHIVED";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      {/* ------------------------------------------------------------ content */}
      <div className="min-w-0 space-y-4">
        {readOnly && <Alert variant="info">{t("posts.readOnly")}</Alert>}
        <Card>
          <CardContent className="pt-5">
            <TranslationTabs filled={filled}>
              {(l) => (
                <fieldset disabled={readOnly} className="space-y-4 pt-2">
                  <Field label={t("posts.fields.title")} htmlFor={`title-${l}`} required={l === "TET"} error={errors[`${l}.title`]}>
                    <Input value={tr[l].title} onChange={(e) => setField(l, { title: e.target.value })} maxLength={220} />
                  </Field>
                  <Field label={t("posts.fields.slug")} htmlFor={`slug-${l}`} hint={t("posts.fields.slugHint")} error={errors[`${l}.slug`]}>
                    <Input
                      value={tr[l].slug}
                      onChange={(e) => setField(l, { slug: e.target.value.toLowerCase().replace(/\s+/g, "-") })}
                      maxLength={200}
                      placeholder="titulu-artigu"
                    />
                  </Field>
                  <Field label={t("posts.fields.excerpt")} htmlFor={`excerpt-${l}`} hint={t("posts.fields.excerptHint")} error={errors[`${l}.excerpt`]}>
                    <Textarea value={tr[l].excerpt} onChange={(e) => setField(l, { excerpt: e.target.value })} maxLength={600} rows={3} />
                  </Field>
                  <div className="space-y-1.5">
                    <Label htmlFor={`content-${l}`}>{t("posts.fields.content")}</Label>
                    <RichTextEditor
                      id={`content-${l}`}
                      initialContent={initialContent[l]}
                      editable={!readOnly}
                      placeholder={t("editor.placeholder")}
                      invalid={!!errors[`${l}.contentHtml`]}
                      onChange={(v) => setField(l, { contentJson: v.json, contentHtml: v.html })}
                    />
                    {errors[`${l}.contentHtml`] && <p className="text-xs font-medium text-destructive">{errors[`${l}.contentHtml`]}</p>}
                  </div>
                  <details className="rounded-md border p-3">
                    <summary className="cursor-pointer text-sm font-semibold">{t("posts.seo")}</summary>
                    <div className="mt-3 space-y-4">
                      <Field label={t("posts.fields.seoTitle")} htmlFor={`seo-title-${l}`} hint={`${tr[l].seoTitle.length}/70`} error={errors[`${l}.seoTitle`]}>
                        <Input value={tr[l].seoTitle} onChange={(e) => setField(l, { seoTitle: e.target.value })} maxLength={70} />
                      </Field>
                      <Field
                        label={t("posts.fields.seoDescription")}
                        htmlFor={`seo-desc-${l}`}
                        hint={`${tr[l].seoDescription.length}/170`}
                        error={errors[`${l}.seoDescription`]}
                      >
                        <Textarea value={tr[l].seoDescription} onChange={(e) => setField(l, { seoDescription: e.target.value })} maxLength={170} rows={2} />
                      </Field>
                    </div>
                  </details>
                </fieldset>
              )}
            </TranslationTabs>
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------ sidebar */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("posts.publishing")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <PublishStatusBadge status={status} label={tc(`enums.publishStatus.${status}`)} />
              {dirty && <Badge variant="warning">{t("posts.unsaved")}</Badge>}
            </div>
            {post && (
              <dl className="space-y-1 text-xs text-muted-foreground">
                {post.status === "SCHEDULED" && post.scheduledAt && (
                  <div>
                    <dt className="inline">{t("posts.scheduledFor")}: </dt>
                    <dd className="inline font-medium text-foreground">{formatDateTime(post.scheduledAt, locale)}</dd>
                  </div>
                )}
                {post.publishedAt && (
                  <div>
                    <dt className="inline">{t("posts.publishedAt")}: </dt>
                    <dd className="inline">{formatDateTime(post.publishedAt, locale)}</dd>
                  </div>
                )}
                <div>
                  <dt className="inline">{t("posts.updated")}: </dt>
                  <dd className="inline">{formatDateTime(post.updatedAt, locale)}</dd>
                </div>
                {post.authorName && (
                  <div>
                    <dt className="inline">{t("posts.author")}: </dt>
                    <dd className="inline">{post.authorName}</dd>
                  </div>
                )}
                {post.reviewerName && (
                  <div>
                    <dt className="inline">{t("posts.reviewer")}: </dt>
                    <dd className="inline">{post.reviewerName}</dd>
                  </div>
                )}
              </dl>
            )}

            {permissions.write && (
              <Button className="w-full" onClick={onSave} loading={busy === "save"} disabled={!!busy}>
                <Save aria-hidden />
                {post ? tc("actions.save") : t("posts.saveDraft")}
              </Button>
            )}
            {!post && <p className="text-xs text-muted-foreground">{t("posts.saveFirst")}</p>}
            <div className="grid gap-2">
              {canSubmitReview && (
                <Button variant="outline" onClick={() => workflow("submit_review")} loading={busy === "submit_review"} disabled={!!busy}>
                  <Send aria-hidden />
                  {t("posts.actions.submit_review")}
                </Button>
              )}
              {canPublish && (
                <Button variant="gold" onClick={() => workflow("publish")} loading={busy === "publish"} disabled={!!busy}>
                  <Upload aria-hidden />
                  {status === "SCHEDULED" ? t("posts.actions.publishNow") : t("posts.actions.publish")}
                </Button>
              )}
              {canSchedule && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setScheduleError(null);
                    setScheduleOpen(true);
                  }}
                  disabled={!!busy}
                >
                  <CalendarClock aria-hidden />
                  {status === "SCHEDULED" ? t("posts.actions.reschedule") : t("posts.actions.schedule")}
                </Button>
              )}
              {canUnpublish && (
                <Button variant="outline" onClick={() => workflow("unpublish")} loading={busy === "unpublish"} disabled={!!busy}>
                  <EyeOff aria-hidden />
                  {status === "SCHEDULED" ? t("posts.actions.cancelSchedule") : status === "PUBLISHED" ? t("posts.actions.unpublish") : t("posts.actions.backToDraft")}
                </Button>
              )}
              {canArchive && (
                <Button variant="ghost" onClick={() => workflow("archive")} loading={busy === "archive"} disabled={!!busy}>
                  <Archive aria-hidden />
                  {t("posts.actions.archive")}
                </Button>
              )}
              {previewHref && (
                <a href={previewHref} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-primary hover:underline">
                  <Eye className="size-4" aria-hidden />
                  {t("posts.viewPublic")}
                  <ExternalLink className="size-3.5" aria-hidden />
                </a>
              )}
            </div>
            {post && !permissions.publish && permissions.write && <p className="text-xs text-muted-foreground">{t("posts.publishHint")}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("posts.details")}</CardTitle>
          </CardHeader>
          <CardContent>
            <fieldset disabled={readOnly} className="space-y-4">
              <Field label={t("posts.type")} htmlFor="post-type" error={errors.type}>
                <NativeSelect
                  value={type}
                  onChange={(e) => {
                    setType(e.target.value as PostTypeValue);
                    touch();
                  }}
                >
                  {POST_TYPES.map((v) => (
                    <option key={v} value={v}>
                      {tc(`enums.postType.${v}`)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={t("posts.category")} htmlFor="post-category" error={errors.categoryId}>
                <NativeSelect
                  value={categoryId}
                  onChange={(e) => {
                    setCategoryId(e.target.value);
                    touch();
                  }}
                >
                  <option value="">{t("posts.noCategory")}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={tc("geo.municipality")} htmlFor="post-mun" hint={t("posts.municipalityHint")} error={errors.municipalityId}>
                <NativeSelect
                  value={municipalityId}
                  onChange={(e) => {
                    setMunicipalityId(e.target.value);
                    touch();
                  }}
                >
                  <option value="">{t("posts.national")}</option>
                  {municipalities.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <MediaField
                id="post-cover"
                label={t("posts.cover")}
                value={cover}
                onChange={(v) => {
                  setCover(v);
                  touch();
                }}
                error={errors.coverId}
              />
              <Field label={t("posts.attachment")} htmlFor="post-attachment" hint={t("posts.attachmentHint")} error={errors.attachmentId}>
                <NativeSelect
                  value={attachmentId}
                  onChange={(e) => {
                    setAttachmentId(e.target.value);
                    touch();
                  }}
                >
                  <option value="">{t("posts.noAttachment")}</option>
                  {documents.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title} · {tc(`enums.documentType.${d.type}`)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={t("posts.byline")} htmlFor="post-byline" hint={t("posts.bylineHint")} error={errors.byline}>
                <Input
                  value={byline}
                  maxLength={160}
                  onChange={(e) => {
                    setByline(e.target.value);
                    touch();
                  }}
                />
              </Field>
              <Field label={t("posts.tags")} htmlFor="post-tags" hint={t("posts.tagsHint")} error={errors.tags}>
                <Input
                  value={tags}
                  onChange={(e) => {
                    setTags(e.target.value);
                    touch();
                  }}
                />
              </Field>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="post-featured">{t("posts.featured")}</Label>
                <Switch
                  id="post-featured"
                  checked={isFeatured}
                  onCheckedChange={(v) => {
                    setFeatured(v);
                    touch();
                  }}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="post-hero">{t("posts.pinnedToHero")}</Label>
                <Switch
                  id="post-hero"
                  checked={pinnedToHero}
                  onCheckedChange={(v) => {
                    setPinned(v);
                    touch();
                  }}
                />
              </div>
            </fieldset>
          </CardContent>
        </Card>

        {post && permissions.delete && (
          <Button variant="ghost" className="w-full text-destructive hover:bg-destructive/10" onClick={() => setDeleteOpen(true)} disabled={!!busy}>
            <Trash2 aria-hidden />
            {t("posts.delete")}
          </Button>
        )}
      </div>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent title={t("posts.scheduleTitle")} description={t("posts.scheduleDescription")}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSchedule();
            }}
            className="space-y-4"
          >
            <Field label={t("posts.scheduleAt")} htmlFor="schedule-at" hint={t("posts.timezoneHint")} error={scheduleError} required>
              <Input type="datetime-local" value={scheduleAt} min={toDiliInput(new Date())} onChange={(e) => setScheduleAt(e.target.value)} required />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setScheduleOpen(false)}>
                {tc("actions.cancel")}
              </Button>
              <Button type="submit" loading={busy === "schedule"}>
                <CalendarClock aria-hidden />
                {t("posts.actions.schedule")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t("posts.deleteTitle")}
        description={t("posts.deleteDescription")}
        confirmLabel={tc("actions.delete")}
        cancelLabel={tc("actions.cancel")}
        destructive
        loading={busy === "delete"}
        onConfirm={onDelete}
      />
    </div>
  );
}
