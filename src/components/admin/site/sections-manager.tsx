"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import type { JSONContent } from "@tiptap/react";
import { DynamicIcon, iconNames, type IconName } from "lucide-react/dynamic";
import { EyeOff, LayoutList, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { api, errorMessage } from "@/lib/api-client";
import { TranslationTabs } from "@/components/admin/translation-tabs";
import { Button } from "@/components/ui/button";
import { Field, Input, Label } from "@/components/ui/form-controls";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { ConfirmDialog, Dialog, DialogContent, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { RichTextEditor } from "@/components/admin/cms/rich-text-editor";
import { byLocale, fromRows, mapFieldErrors, pickRow, translationPayload, type ByLocale } from "@/components/admin/cms/form-helpers";
import { moveItem, OrderButtons } from "./order-buttons";

export const PAGE_KEYS = ["ABOUT", "HISTORY", "IDEOLOGY", "PROGRAM"] as const;
type PageKeyValue = (typeof PAGE_KEYS)[number];

export interface SectionRow {
  id: string;
  page: PageKeyValue;
  icon: string | null;
  sortOrder: number;
  isVisible: boolean;
  translations: { locale: string; title: string; contentHtml: string; contentJson: unknown }[];
}

const ICON_SET = new Set<string>(iconNames);
const isIcon = (v: string | null | undefined): v is IconName => !!v && ICON_SET.has(v);

export function SectionIcon({ name, className = "size-5" }: { name: string | null; className?: string }) {
  if (!isIcon(name)) return null;
  return <DynamicIcon name={name} className={className} aria-hidden />;
}

export function SectionsManager({ sections, canWrite }: { sections: SectionRow[]; canWrite: boolean }) {
  const t = useTranslations("cms");
  return (
    <Tabs defaultValue="ABOUT">
      <TabsList className="h-auto flex-wrap">
        {PAGE_KEYS.map((p) => (
          <TabsTrigger key={p} value={p}>
            {t(`site.pages.${p}`)}
            <span className="text-xs text-muted-foreground">({sections.filter((s) => s.page === p).length})</span>
          </TabsTrigger>
        ))}
      </TabsList>
      {PAGE_KEYS.map((p) => (
        <TabsContent key={p} value={p}>
          <PageSections page={p} initial={sections.filter((s) => s.page === p)} canWrite={canWrite} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function PageSections({ page, initial, canWrite }: { page: PageKeyValue; initial: SectionRow[]; canWrite: boolean }) {
  const t = useTranslations("cms");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [editing, setEditing] = useState<SectionRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<SectionRow | null>(null);
  const [busy, setBusy] = useState(false);

  // Server data wins after router.refresh().
  useEffect(() => setItems(initial), [initial]);

  const move = async (index: number, delta: number) => {
    const next = moveItem(items, index, delta);
    if (next === items) return;
    const prev = items;
    setItems(next);
    try {
      await api.post("/api/admin/site/sections/reorder", { ids: next.map((s) => s.id) });
      router.refresh();
    } catch (err) {
      setItems(prev);
      toast.error(errorMessage(err, tc));
    }
  };

  const toggleVisible = async (s: SectionRow, isVisible: boolean) => {
    setItems((list) => list.map((x) => (x.id === s.id ? { ...x, isVisible } : x)));
    try {
      await api.patch(`/api/admin/site/sections/${s.id}`, { isVisible });
      router.refresh();
    } catch (err) {
      setItems((list) => list.map((x) => (x.id === s.id ? { ...x, isVisible: !isVisible } : x)));
      toast.error(errorMessage(err, tc));
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.delete(`/api/admin/site/sections/${deleting.id}`);
      toast.success(t("site.sectionDeleted"));
      setDeleting(null);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, tc));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t(`site.pageHints.${page}`)}</p>
        {canWrite && (
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus aria-hidden />
            {t("site.addSection")}
          </Button>
        )}
      </div>
      {items.length === 0 ? (
        <EmptyState icon={LayoutList} title={t("site.noSections")} description={canWrite ? t("site.noSectionsHint") : undefined} />
      ) : (
        <ol className="divide-y rounded-lg border bg-card">
          {items.map((s, i) => {
            const tr = pickRow(s.translations, locale);
            const title = tr?.title ?? "—";
            return (
              <li key={s.id} className="flex items-center gap-3 p-3">
                {canWrite && <OrderButtons index={i} count={items.length} onMove={(d) => move(i, d)} label={title} />}
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  {isIcon(s.icon) ? <SectionIcon name={s.icon} /> : <span className="text-xs font-semibold tabular-nums">{i + 1}</span>}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{title}</p>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {s.translations.map((x) => (
                      <Badge key={x.locale} variant="muted">
                        {x.locale.toLowerCase()}
                      </Badge>
                    ))}
                    {!s.isVisible && (
                      <Badge variant="warning">
                        <EyeOff className="size-3" aria-hidden />
                        {t("site.hidden")}
                      </Badge>
                    )}
                  </div>
                </div>
                {canWrite && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Switch checked={s.isVisible} onCheckedChange={(v) => toggleVisible(s, v)} aria-label={t("site.visibleOn", { name: title })} />
                    <Button size="icon-sm" variant="ghost" onClick={() => setEditing(s)} aria-label={`${tc("actions.edit")}: ${title}`}>
                      <Pencil aria-hidden />
                    </Button>
                    <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => setDeleting(s)} aria-label={`${tc("actions.delete")}: ${title}`}>
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {editing && (
        <SectionDialog
          key={editing === "new" ? "new" : editing.id}
          page={page}
          section={editing === "new" ? null : editing}
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
        title={t("site.deleteSectionTitle")}
        description={t("site.deleteSectionDescription")}
        confirmLabel={tc("actions.delete")}
        cancelLabel={tc("actions.cancel")}
        destructive
        loading={busy}
        onConfirm={remove}
      />
    </div>
  );
}

interface SecTr {
  title: string;
  contentHtml: string;
  contentJson: JSONContent | null;
}

function SectionDialog({ page, section, onClose, onSaved }: { page: PageKeyValue; section: SectionRow | null; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("cms");
  const tc = useTranslations("common");
  const [icon, setIcon] = useState(section?.icon ?? "");
  const [isVisible, setVisible] = useState(section?.isVisible ?? true);
  const [tr, setTr] = useState<ByLocale<SecTr>>(() =>
    fromRows(
      section?.translations,
      () => ({ title: "", contentHtml: "", contentJson: null }),
      (r) => ({ title: r.title, contentHtml: r.contentHtml, contentJson: (r.contentJson as JSONContent | null) ?? null }),
    ),
  );
  const initialContent = useMemo(
    () => byLocale((l) => {
      const r = section?.translations.find((x) => x.locale === l);
      return (r?.contentJson as JSONContent | null) ?? r?.contentHtml ?? null;
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const iconValue = icon.trim().toLowerCase();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (iconValue && !isIcon(iconValue)) local.icon = t("site.iconUnknown");
    const { sent, translations, removeLocales } = translationPayload(
      tr,
      (v) => !!v.title.trim(),
      (l, v) => ({ locale: l, title: v.title.trim(), contentHtml: v.contentHtml, contentJson: v.contentJson ?? undefined }),
      section?.translations.map((x) => x.locale),
    );
    if (!sent.length) local["TET.title"] = t("site.titleRequired");
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      if (section) await api.patch(`/api/admin/site/sections/${section.id}`, { icon: iconValue || null, isVisible, translations, removeLocales });
      else await api.post("/api/admin/site/sections", { page, icon: iconValue || undefined, isVisible, translations });
      toast.success(section ? tc("states.saved") : t("site.sectionCreated"));
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
      <DialogContent wide title={`${t(`site.pages.${page}`)} · ${section ? t("site.editSection") : t("site.addSection")}`}>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("site.icon")} htmlFor="sec-icon" hint={page === "PROGRAM" ? t("site.iconHintProgram") : t("site.iconHint")} error={errors.icon}>
              <div className="flex items-center gap-2">
                <Input value={icon} onChange={(e) => setIcon(e.target.value)} list="lucide-icons" placeholder="graduation-cap" maxLength={50} autoComplete="off" />
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted" aria-hidden>
                  <SectionIcon name={iconValue} />
                </span>
              </div>
            </Field>
            <datalist id="lucide-icons">
              {iconNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            <div className="flex items-center justify-between gap-3 rounded-md border p-3 sm:mt-6">
              <Label htmlFor="sec-visible">{t("site.visible")}</Label>
              <Switch id="sec-visible" checked={isVisible} onCheckedChange={setVisible} />
            </div>
          </div>

          <TranslationTabs filled={byLocale((l) => !!tr[l].title.trim())}>
            {(l) => (
              <div className="space-y-4 pt-2">
                <Field label={t("site.sectionTitle")} htmlFor={`sec-title-${l}`} required={l === "TET"} error={errors[`${l}.title`]}>
                  <Input value={tr[l].title} maxLength={220} onChange={(e) => setTr((s) => ({ ...s, [l]: { ...s[l], title: e.target.value } }))} />
                </Field>
                <div className="space-y-1.5">
                  <Label htmlFor={`sec-content-${l}`}>{t("site.content")}</Label>
                  <RichTextEditor
                    id={`sec-content-${l}`}
                    initialContent={initialContent[l]}
                    minHeight="min-h-48"
                    placeholder={t("editor.placeholder")}
                    onChange={(v) => setTr((s) => ({ ...s, [l]: { ...s[l], contentHtml: v.html, contentJson: v.json } }))}
                  />
                </div>
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
