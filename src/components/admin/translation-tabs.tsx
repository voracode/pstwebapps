"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { cn } from "@/lib/utils/cn";

export const EDIT_LOCALES = ["TET", "PT", "ID", "EN"] as const;
export type EditLocale = (typeof EDIT_LOCALES)[number];

const LOCALE_KEY: Record<EditLocale, "tet" | "pt" | "id" | "en"> = { TET: "tet", PT: "pt", ID: "id", EN: "en" };

/**
 * Tabbed editor for multilingual content. Render the fields for one locale in
 * `children(locale)`; `filled[locale]` drives the green/grey dot on each tab.
 *
 *   <TranslationTabs filled={{ TET: !!tr.TET?.title, PT: !!tr.PT?.title, ID: false, EN: false }}>
 *     {(l) => <Input value={tr[l]?.title ?? ""} onChange={…} />}
 *   </TranslationTabs>
 *
 * Convention: send only locales whose required field is non-empty, and put
 * the rest in `removeLocales` on update.
 */
export function TranslationTabs({
  filled,
  children,
  defaultLocale = "TET",
  className,
}: {
  filled: Partial<Record<EditLocale, boolean>>;
  children: (locale: EditLocale) => ReactNode;
  defaultLocale?: EditLocale;
  className?: string;
}) {
  const t = useTranslations("common");
  return (
    <Tabs defaultValue={defaultLocale} className={className}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList aria-label={t("translations.languages")}>
          {EDIT_LOCALES.map((l) => (
            <TabsTrigger key={l} value={l} title={filled[l] ? t("translations.filled") : t("translations.missing")}>
              <span aria-hidden className={cn("size-2 rounded-full", filled[l] ? "bg-green-500" : "bg-slate-300")} />
              {t(`langName.${LOCALE_KEY[l]}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <p className="text-xs text-muted-foreground">{t("translations.hint")}</p>
      </div>
      {EDIT_LOCALES.map((l) => (
        <TabsContent key={l} value={l} forceMount className="data-[state=inactive]:hidden">
          {children(l)}
        </TabsContent>
      ))}
    </Tabs>
  );
}
