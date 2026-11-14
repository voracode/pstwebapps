"use client";

import { useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Globe } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils/cn";

const SHORT: Record<string, string> = { tet: "TET", pt: "PT", id: "ID", en: "EN" };

/**
 * Language switcher. `variant="pills"` shows all four codes inline (header on
 * desktop); `variant="select"` is a compact native select (mobile, admin).
 */
export function LocaleSwitcher({ variant = "select", className, tone = "default" }: { variant?: "select" | "pills"; className?: string; tone?: "default" | "light" }) {
  const locale = useLocale();
  const t = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [pending, start] = useTransition();

  const go = (next: string) => {
    const q = search.toString();
    start(() => router.replace(q ? `${pathname}?${q}` : pathname, { locale: next }));
  };

  if (variant === "pills") {
    return (
      <div role="group" aria-label={t("language")} className={cn("flex items-center gap-0.5", pending && "opacity-60", className)}>
        {routing.locales.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => go(l)}
            aria-pressed={l === locale}
            title={t(`langName.${l}`)}
            className={cn(
              "rounded px-1.5 py-0.5 text-xs font-bold transition-colors cursor-pointer",
              tone === "light"
                ? l === locale ? "bg-white text-pst-red" : "text-white/80 hover:text-white"
                : l === locale ? "bg-pst-red text-white" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {SHORT[l]}
          </button>
        ))}
      </div>
    );
  }

  return (
    <label className={cn("relative inline-flex items-center gap-1.5 text-sm", className)}>
      <Globe className="size-4 text-muted-foreground" aria-hidden />
      <span className="sr-only">{t("language")}</span>
      <select
        value={locale}
        onChange={(e) => go(e.target.value)}
        disabled={pending}
        className="cursor-pointer bg-transparent pr-1 font-medium focus-visible:outline-none"
      >
        {routing.locales.map((l) => (
          <option key={l} value={l}>
            {t(`langName.${l}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
