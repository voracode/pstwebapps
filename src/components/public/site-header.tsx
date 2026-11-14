"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { Emblem } from "@/components/brand/emblem";
import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

const NAV = [
  { href: "/about", key: "about" },
  { href: "/news", key: "news" },
  { href: "/media", key: "media" },
  { href: "/documents", key: "documents" },
  { href: "/municipalities", key: "municipalities" },
  { href: "/events", key: "events" },
  { href: "/contact", key: "contact" },
] as const;

const MOBILE_EXTRA = [
  { href: "/press", key: "press" },
  { href: "/voice", key: "voice" },
  { href: "/membership-status", key: "membershipStatus" },
] as const;

export function SiteHeader() {
  const t = useTranslations("public.nav");
  const tm = useTranslations("public.meta");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close the mobile menu on navigation.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`) || (href === "/news" && pathname.startsWith("/press"));

  return (
    <header className="sticky top-0 z-40 border-t-4 border-pst-red bg-background/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-pst-ink focus:px-4 focus:py-2 focus:text-white"
      >
        {t("skipToContent")}
      </a>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 xl:max-w-7xl">
        <Link href="/" className="flex min-w-0 items-center gap-2.5" aria-label={`${tm("name")} — ${t("home")}`}>
          <Emblem size={44} priority />
          <span className="flex min-w-0 flex-col leading-none">
            <span className="font-display text-xl font-extrabold uppercase tracking-wide text-pst-red">PST</span>
            <span className="truncate text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground sm:text-xs lg:max-xl:hidden">{tm("name")}</span>
          </span>
        </Link>

        <nav aria-label={t("mainNav")} className="ml-auto hidden shrink-0 lg:block">
          <ul className="flex items-center gap-0.5">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link
                  href={n.href}
                  aria-current={isActive(n.href) ? "page" : undefined}
                  className={cn(
                    "whitespace-nowrap rounded-md px-2 py-2 text-sm font-semibold transition-colors hover:bg-muted hover:text-pst-red xl:px-2.5",
                    isActive(n.href) ? "text-pst-red" : "text-foreground/80",
                  )}
                >
                  {t(n.key)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-2">
          <Suspense fallback={null}>
            <LocaleSwitcher variant="pills" className="hidden sm:flex" />
          </Suspense>
          <Link href="/join" className={cn(buttonVariants({ size: "sm" }), "h-9 px-4 font-bold uppercase tracking-wide")}>
            {t("join")}
          </Link>
          <button
            ref={buttonRef}
            type="button"
            className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "lg:hidden")}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? t("closeMenu") : t("openMenu")}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          </button>
        </div>
      </div>

      <div id="mobile-menu" hidden={!open} className="border-t bg-background lg:hidden">
        <nav aria-label={t("mainNav")} className="mx-auto max-w-6xl px-4 py-3">
          <ul className="grid gap-0.5">
            {[...NAV, ...MOBILE_EXTRA].map((n) => (
              <li key={n.href}>
                <Link
                  href={n.href}
                  aria-current={isActive(n.href) ? "page" : undefined}
                  className={cn(
                    "block rounded-md px-3 py-2.5 text-base font-semibold hover:bg-muted",
                    isActive(n.href) ? "bg-pst-red-50 text-pst-red" : "text-foreground",
                  )}
                >
                  {t(n.key)}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between border-t pt-3">
            <Suspense fallback={null}>
              <LocaleSwitcher variant="select" />
            </Suspense>
            <Link href="/join" className={buttonVariants({ size: "sm" })}>
              {t("join")}
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
