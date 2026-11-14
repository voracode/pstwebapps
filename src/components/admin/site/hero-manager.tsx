"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ExternalLink, GalleryHorizontal, ImageIcon, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { api, errorMessage } from "@/lib/api-client";
import { TranslationTabs } from "@/components/admin/translation-tabs";
import { Button } from "@/components/ui/button";
import { Field, Input, Label } from "@/components/ui/form-controls";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { ConfirmDialog, Dialog, DialogContent, Switch } from "@/components/ui/overlays";
import { MediaField } from "@/components/admin/cms/media-picker";
import type { MediaRef } from "@/components/admin/cms/media-types";
import { formatDateTime } from "@/lib/format";
import { byLocale, fromDiliInput, fromRows, isHttpsUrl, mapFieldErrors, pickRow, toDiliInput, translationPayload, type ByLocale } from "@/components/admin/cms/form-helpers";
import { moveItem, OrderButtons } from "./order-buttons";

export interface HeroRow {
  id: string;
  imageId: string | null;
  imageUrl: string | null;
  ctaHref: string | null;
  sortOrder: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  translations: { locale: string; headline: string; subline: string | null; ctaLabel: string | null }[];
}

type SlideState = "live" | "inactive" | "upcoming" | "ended";

function slideState(s: HeroRow, now: number): SlideState {
  if (!s.isActive) return "inactive";
  if (s.startsAt && new Date(s.startsAt).getTime() > now) return "upcoming";
  if (s.endsAt && new Date(s.endsAt).getTime() <= now) return "ended";
  return "live";
}

const STATE_VARIANT = { live: "success", inactive: "muted", upcoming: "info", ended: "outline" } as const;

export function HeroManager({ slides, canWrite, now }: { slides: HeroRow[]; canWrite: boolean; now: number }) {
  const t = useTranslations("cms");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [items, setItems] = useState(slides);
  const [editing, setEditing] = useState<HeroRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<HeroRow | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setItems(slides), [slides]);

  const move = async (index: number, delta: number) => {
    const next = moveItem(items, index, delta);
    if (next === items) return;
    const prev = items;
    setItems(next);
    try {
      await api.post("/api/admin/site/hero/reorder", { ids: next.map((s) => s.id) });
      router.refresh();
    } catch (err) {
      setItems(prev);
      toast.error(errorMessage(err, tc));
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.delete(`/api/admin/site/hero/${deleting.id}`);
      toast.success(t("hero.deleted"));
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
        <p className="text-sm text-muted-foreground">{t("hero.description")}</p>
        {canWrite && (
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus aria-hidden />
            {t("hero.new")}
          </Button>
        )}
      </div>
      {items.length === 0 ? (
        <EmptyState icon={GalleryHorizontal} title={t("hero.empty")} description={canWrite ? t("hero.emptyHint") : undefined} />
      ) : (
        <ol className="divide-y rounded-lg border bg-card">
          {items.map((s, i) => {
            const tr = pickRow(s.translations, locale);
            const state = slideState(s, now);
            const headline = tr?.headline ?? "—";
            return (
              <li key={s.id} className="flex items-center gap-3 p-3">
                {canWrite && <OrderButtons index={i} count={items.length} onMove={(d) => move(i, d)} label={headline} />}
                <div className="flex aspect-video w-24 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted sm:w-32">
                  {s.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.imageUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <ImageIcon className="size-6 text-muted-foreground" aria-hidden />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 font-semibold">{headline}</p>
                  {tr?.subline && <p className="line-clamp-1 text-sm text-muted-foreground">{tr.subline}</p>}
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge variant={STATE_VARIANT[state]}>{t(`hero.state.${state}`)}</Badge>
                    {(s.startsAt || s.endsAt) && (
                      <span>
                        {s.startsAt ? formatDateTime(s.startsAt, locale) : "…"} – {s.endsAt ? formatDateTime(s.endsAt, locale) : "…"}
                      </span>
                    )}
                    {s.ctaHref && (
                      <span className="inline-flex max-w-48 items-center gap-0.5 truncate">
                        <ExternalLink className="size-3 shrink-0" aria-hidden />
                        {s.ctaHref}
                      </span>
                    )}
                  </div>
                </div>
                {canWrite && (
                  <div className="flex shrink-0 gap-1">
                    <Button size="icon-sm" variant="ghost" onClick={() => setEditing(s)} aria-label={`${tc("actions.edit")}: ${headline}`}>
                      <Pencil aria-hidden />
                    </Button>
                    <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => setDeleting(s)} aria-label={`${tc("actions.delete")}: ${headline}`}>
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
        <HeroDialog
          key={editing === "new" ? "new" : editing.id}
          slide={editing === "new" ? null : editing}
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
        title={t("hero.deleteTitle")}
        description={t("hero.deleteDescription")}
        confirmLabel={tc("actions.delete")}
        cancelLabel={tc("actions.cancel")}
        destructive
        loading={busy}
        onConfirm={remove}
      />
    </div>
  );
}

interface HeroTr {
  headline: string;
  subline: string;
  ctaLabel: string;
}

function HeroDialog({ slide, onClose, onSaved }: { slide: HeroRow | null; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("cms");
  const tc = useTranslations("common");
  const [image, setImage] = useState<MediaRef | null>(slide?.imageId ? { id: slide.imageId, url: slide.imageUrl, kind: "IMAGE" } : null);
  const [ctaHref, setCtaHref] = useState(slide?.ctaHref ?? "");
  const [isActive, setActive] = useState(slide?.isActive ?? true);
  const [startsAt, setStartsAt] = useState(toDiliInput(slide?.startsAt));
  const [endsAt, setEndsAt] = useState(toDiliInput(slide?.endsAt));
  const [tr, setTr] = useState<ByLocale<HeroTr>>(() =>
    fromRows(
      slide?.translations,
      () => ({ headline: "", subline: "", ctaLabel: "" }),
      (r) => ({ headline: r.headline, subline: r.subline ?? "", ctaLabel: r.ctaLabel ?? "" }),
    ),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const local: Record<string, string> = {};
    const href = ctaHref.trim();
    if (href && !(href.startsWith("/") && !href.startsWith("//")) && !isHttpsUrl(href)) local.ctaHref = t("hero.ctaHrefInvalid");
    if (startsAt && endsAt && endsAt <= startsAt) local.endsAt = t("hero.windowOrder");
    const { sent, translations, removeLocales } = translationPayload(
      tr,
      (v) => !!v.headline.trim(),
      (l, v) => ({ locale: l, headline: v.headline.trim(), subline: v.subline, ctaLabel: v.ctaLabel }),
      slide?.translations.map((x) => x.locale),
    );
    if (!sent.length) local["TET.headline"] = t("hero.headlineRequired");
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    const body = {
      imageId: image?.id ?? null,
      ctaHref: href || null,
      isActive,
      startsAt: fromDiliInput(startsAt),
      endsAt: fromDiliInput(endsAt),
      translations,
      ...(slide ? { removeLocales } : {}),
    };
    setBusy(true);
    setErrors({});
    try {
      if (slide) await api.patch(`/api/admin/site/hero/${slide.id}`, body);
      else await api.post("/api/admin/site/hero", body);
      toast.success(slide ? tc("states.saved") : t("hero.created"));
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
      <DialogContent wide title={slide ? t("hero.edit") : t("hero.new")}>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <MediaField id="hero-image" label={t("hero.image")} value={image} onChange={setImage} hint={t("hero.imageHint")} error={errors.imageId} />
            <div className="space-y-4">
              <Field label={t("hero.ctaHref")} htmlFor="hero-href" hint={t("hero.ctaHrefHint")} error={errors.ctaHref}>
                <Input value={ctaHref} maxLength={255} onChange={(e) => setCtaHref(e.target.value)} placeholder="/membership" />
              </Field>
              <Field label={t("hero.startsAt")} htmlFor="hero-start" hint={t("hero.windowHint")} error={errors.startsAt}>
                <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
              </Field>
              <Field label={t("hero.endsAt")} htmlFor="hero-end" error={errors.endsAt}>
                <Input type="datetime-local" value={endsAt} min={startsAt || undefined} onChange={(e) => setEndsAt(e.target.value)} />
              </Field>
              <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                <Label htmlFor="hero-active">{t("hero.active")}</Label>
                <Switch id="hero-active" checked={isActive} onCheckedChange={setActive} />
              </div>
            </div>
          </div>

          <TranslationTabs filled={byLocale((l) => !!tr[l].headline.trim())}>
            {(l) => (
              <div className="grid gap-4 pt-2 sm:grid-cols-2">
                <Field label={t("hero.headline")} htmlFor={`hero-h-${l}`} required={l === "TET"} error={errors[`${l}.headline`]} className="sm:col-span-2">
                  <Input value={tr[l].headline} maxLength={160} onChange={(e) => setTr((s) => ({ ...s, [l]: { ...s[l], headline: e.target.value } }))} />
                </Field>
                <Field label={t("hero.subline")} htmlFor={`hero-s-${l}`} error={errors[`${l}.subline`]}>
                  <Input value={tr[l].subline} maxLength={300} onChange={(e) => setTr((s) => ({ ...s, [l]: { ...s[l], subline: e.target.value } }))} />
                </Field>
                <Field label={t("hero.ctaLabel")} htmlFor={`hero-c-${l}`} error={errors[`${l}.ctaLabel`]}>
                  <Input value={tr[l].ctaLabel} maxLength={60} onChange={(e) => setTr((s) => ({ ...s, [l]: { ...s[l], ctaLabel: e.target.value } }))} />
                </Field>
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
