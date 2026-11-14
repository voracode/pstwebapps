"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Download, FileText, MoreHorizontal, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { api, errorMessage } from "@/lib/api-client";
import { TranslationTabs } from "@/components/admin/translation-tabs";
import { Button } from "@/components/ui/button";
import { Field, Input, Label, NativeSelect, Textarea } from "@/components/ui/form-controls";
import { Badge, EmptyState, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { ConfirmDialog, Dialog, DialogContent, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Switch } from "@/components/ui/overlays";
import { formatDate, formatNumber } from "@/lib/format";
import { byLocale, fromRows, mapFieldErrors, pickRow, toDateInput, translationPayload, type ByLocale } from "./form-helpers";
import { MediaField } from "./media-picker";
import type { MediaRef } from "./media-types";

export const DOCUMENT_TYPES = ["STATUTE", "POLITICAL_PROGRAM", "MANIFESTO", "BULLETIN", "LEGISLATION", "RESOLUTION", "REPORT", "OTHER"] as const;
type DocType = (typeof DOCUMENT_TYPES)[number];

export interface DocumentRow {
  id: string;
  type: DocType;
  slug: string;
  versionLabel: string | null;
  isPublic: boolean;
  isFeatured: boolean;
  publishedAt: string | Date | null;
  downloadCount: number;
  translations: { locale: string; title: string; description: string | null; fileId: string | null; fileUrl: string | null }[];
}

export function DocumentsManager({ documents, canWrite }: { documents: DocumentRow[]; canWrite: boolean }) {
  const t = useTranslations("cms");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [editing, setEditing] = useState<DocumentRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<DocumentRow | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.delete(`/api/admin/documents/${deleting.id}`);
      toast.success(t("documents.deleted"));
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
          <Button onClick={() => setEditing("new")}>
            <Plus aria-hidden />
            {t("documents.new")}
          </Button>
        </div>
      )}
      {documents.length === 0 ? (
        <EmptyState icon={FileText} title={t("documents.empty")} description={canWrite ? t("documents.emptyHint") : undefined} />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>{t("documents.titleCol")}</TH>
              <TH>{t("documents.type")}</TH>
              <TH className="hidden md:table-cell">{t("documents.languages")}</TH>
              <TH className="hidden sm:table-cell">{t("documents.publishedAt")}</TH>
              <TH className="hidden lg:table-cell text-right">{t("documents.downloads")}</TH>
              {canWrite && <TH className="w-12"><span className="sr-only">{tc("actions.edit")}</span></TH>}
            </tr>
          </THead>
          <TBody>
            {documents.map((d) => {
              const tr = pickRow(d.translations, locale);
              return (
                <TR key={d.id}>
                  <TD className="max-w-md">
                    <div className="font-semibold">{tr?.title ?? d.slug}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {d.versionLabel && <span>{d.versionLabel}</span>}
                      {!d.isPublic && <Badge variant="warning">{t("documents.internal")}</Badge>}
                      {d.isFeatured && (
                        <span className="inline-flex items-center gap-0.5">
                          <Star className="size-3" aria-hidden />
                          {t("documents.featured")}
                        </span>
                      )}
                    </div>
                  </TD>
                  <TD className="whitespace-nowrap">{tc(`enums.documentType.${d.type}`)}</TD>
                  <TD className="hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {d.translations.map((x) =>
                        x.fileUrl ? (
                          <a key={x.locale} href={x.fileUrl} target="_blank" rel="noreferrer" title={tc("actions.download")}>
                            <Badge variant="info">
                              <Download className="size-3" aria-hidden />
                              {x.locale.toLowerCase()}
                            </Badge>
                          </a>
                        ) : (
                          <Badge key={x.locale} variant="muted" title={t("documents.noFile")}>
                            {x.locale.toLowerCase()}
                          </Badge>
                        ),
                      )}
                    </div>
                  </TD>
                  <TD className="hidden whitespace-nowrap sm:table-cell">{formatDate(d.publishedAt, locale)}</TD>
                  <TD className="hidden text-right tabular-nums lg:table-cell">{formatNumber(d.downloadCount, locale)}</TD>
                  {canWrite && (
                    <TD>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon-sm" variant="ghost" aria-label={t("rowActions")}>
                            <MoreHorizontal aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onSelect={() => setEditing(d)}>
                            <Pencil aria-hidden />
                            {tc("actions.edit")}
                          </DropdownMenuItem>
                          <DropdownMenuItem destructive onSelect={() => setDeleting(d)}>
                            <Trash2 aria-hidden />
                            {tc("actions.delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TD>
                  )}
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}

      {editing && (
        <DocumentDialog
          key={editing === "new" ? "new" : editing.id}
          doc={editing === "new" ? null : editing}
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
        title={t("documents.deleteTitle")}
        description={t("documents.deleteDescription")}
        confirmLabel={tc("actions.delete")}
        cancelLabel={tc("actions.cancel")}
        destructive
        loading={busy}
        onConfirm={remove}
      />
    </>
  );
}

interface DocTr {
  title: string;
  description: string;
  file: MediaRef | null;
}

function DocumentDialog({ doc, onClose, onSaved }: { doc: DocumentRow | null; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("cms");
  const tc = useTranslations("common");
  const [type, setType] = useState<DocType>(doc?.type ?? "OTHER");
  const [slug, setSlug] = useState(doc?.slug ?? "");
  const [versionLabel, setVersionLabel] = useState(doc?.versionLabel ?? "");
  const [isPublic, setPublic] = useState(doc?.isPublic ?? true);
  const [isFeatured, setFeatured] = useState(doc?.isFeatured ?? false);
  const [publishedAt, setPublishedAt] = useState(toDateInput(doc?.publishedAt ?? new Date()));
  const [tr, setTr] = useState<ByLocale<DocTr>>(() =>
    fromRows(
      doc?.translations,
      () => ({ title: "", description: "", file: null }),
      (r) => ({
        title: r.title,
        description: r.description ?? "",
        file: r.fileId ? { id: r.fileId, url: r.fileUrl, kind: "DOCUMENT", name: r.title } : null,
      }),
    ),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { sent, translations, removeLocales } = translationPayload(
      tr,
      (v) => !!v.title.trim(),
      (l, v) => ({ locale: l, title: v.title.trim(), description: v.description, fileId: v.file?.id }),
      doc?.translations.map((x) => x.locale),
    );
    if (!sent.length) {
      setErrors({ "TET.title": t("documents.titleRequired") });
      return;
    }
    const body = {
      type,
      slug: slug.trim() || undefined,
      versionLabel: versionLabel.trim(),
      isPublic,
      isFeatured,
      publishedAt: publishedAt ? `${publishedAt}T00:00:00+09:00` : undefined,
      translations,
      ...(doc ? { removeLocales } : {}),
    };
    setBusy(true);
    setErrors({});
    try {
      if (doc) await api.patch(`/api/admin/documents/${doc.id}`, body);
      else await api.post("/api/admin/documents", body);
      toast.success(doc ? tc("states.saved") : t("documents.created"));
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
      <DialogContent wide title={doc ? t("documents.edit") : t("documents.new")}>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("documents.type")} htmlFor="doc-type" required error={errors.type}>
              <NativeSelect value={type} onChange={(e) => setType(e.target.value as DocType)}>
                {DOCUMENT_TYPES.map((v) => (
                  <option key={v} value={v}>
                    {tc(`enums.documentType.${v}`)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t("documents.version")} htmlFor="doc-version" hint={t("documents.versionHint")} error={errors.versionLabel}>
              <Input value={versionLabel} maxLength={40} onChange={(e) => setVersionLabel(e.target.value)} />
            </Field>
            <Field label={t("documents.publishedAt")} htmlFor="doc-date" error={errors.publishedAt}>
              <Input type="date" value={publishedAt} onChange={(e) => setPublishedAt(e.target.value)} />
            </Field>
            <Field label={t("documents.slug")} htmlFor="doc-slug" hint={t("documents.slugHint")} error={errors.slug}>
              <Input value={slug} maxLength={160} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))} />
            </Field>
            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <Label htmlFor="doc-public">{t("documents.public")}</Label>
                <p className="text-xs text-muted-foreground">{t("documents.publicHint")}</p>
              </div>
              <Switch id="doc-public" checked={isPublic} onCheckedChange={setPublic} />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border p-3">
              <Label htmlFor="doc-featured">{t("documents.featured")}</Label>
              <Switch id="doc-featured" checked={isFeatured} onCheckedChange={setFeatured} />
            </div>
          </div>

          <TranslationTabs filled={byLocale((l) => !!tr[l].title.trim())}>
            {(l) => (
              <div className="space-y-4 pt-2">
                <Field label={t("documents.titleCol")} htmlFor={`doc-title-${l}`} required={l === "TET"} error={errors[`${l}.title`]}>
                  <Input value={tr[l].title} maxLength={220} onChange={(e) => setTr((s) => ({ ...s, [l]: { ...s[l], title: e.target.value } }))} />
                </Field>
                <Field label={t("documents.descriptionField")} htmlFor={`doc-desc-${l}`} error={errors[`${l}.description`]}>
                  <Textarea
                    value={tr[l].description}
                    maxLength={2000}
                    rows={3}
                    onChange={(e) => setTr((s) => ({ ...s, [l]: { ...s[l], description: e.target.value } }))}
                  />
                </Field>
                <MediaField
                  id={`doc-file-${l}`}
                  label={t("documents.file")}
                  kinds={["DOCUMENT"]}
                  value={tr[l].file}
                  hint={t("documents.fileHint")}
                  error={errors[`${l}.fileId`]}
                  onChange={(v) => setTr((s) => ({ ...s, [l]: { ...s[l], file: v } }))}
                />
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
