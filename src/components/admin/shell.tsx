"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  BookOpen,
  CalendarDays,
  ExternalLink,
  FileText,
  Globe2,
  Image as ImageIcon,
  Inbox,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  Moon,
  Network,
  ScrollText,
  Sun,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api-client";
import type { ClientUser } from "@/lib/auth/server";
import type { Permission } from "@/lib/security/rbac";
import { cn } from "@/lib/utils/cn";
import { Emblem } from "@/components/brand/emblem";
import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/overlays";

interface NavItem {
  key: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: Permission;
  group: "main" | "sim" | "content" | "system";
}

/** Single source of truth for backoffice navigation. */
export const NAV: NavItem[] = [
  { key: "dashboard", href: "/admin", icon: LayoutDashboard, permission: "dashboard:read", group: "main" },
  { key: "members", href: "/admin/members", icon: Users, permission: "member:read", group: "sim" },
  { key: "events", href: "/admin/events", icon: CalendarDays, permission: "event:read", group: "sim" },
  { key: "aspirations", href: "/admin/aspirations", icon: Megaphone, permission: "aspiration:read", group: "sim" },
  { key: "messages", href: "/admin/messages", icon: Inbox, permission: "contact:read", group: "sim" },
  { key: "posts", href: "/admin/posts", icon: FileText, permission: "post:read", group: "content" },
  { key: "media", href: "/admin/media", icon: ImageIcon, permission: "media:write", group: "content" },
  { key: "documents", href: "/admin/documents", icon: BookOpen, permission: "document:write", group: "content" },
  { key: "leadership", href: "/admin/leadership", icon: Network, permission: "leadership:write", group: "content" },
  { key: "site", href: "/admin/site", icon: Globe2, permission: "post:write", group: "content" },
  { key: "users", href: "/admin/users", icon: UserCog, permission: "user:manage", group: "system" },
  { key: "audit", href: "/admin/audit", icon: ScrollText, permission: "audit:read", group: "system" },
];

const THEME_COOKIE = "pst-admin-theme";

export function AdminShell({
  user,
  scopeLabel,
  initialDark,
  children,
}: {
  user: ClientUser;
  scopeLabel: string;
  initialDark: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(initialDark);

  useEffect(() => setOpen(false), [pathname]);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.cookie = `${THEME_COOKIE}=${next ? "dark" : "light"}; path=/; max-age=31536000; samesite=lax`;
  };

  const logout = async () => {
    try {
      await api.post("/api/auth/logout");
    } finally {
      router.replace("/admin/login");
      router.refresh();
    }
  };

  const items = NAV.filter((n) => !n.permission || user.permissions.includes(n.permission));
  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`));

  const nav = (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4" aria-label={t("title")}>
      {(["main", "sim", "content", "system"] as const).map((g) => {
        const group = items.filter((i) => i.group === g);
        if (!group.length) return null;
        return (
          <div key={g} className="space-y-1">
            {g !== "main" && <p className="px-3 pb-1 text-[0.65rem] font-bold uppercase tracking-[0.18em] text-white/40">{t(`groups.${g}`)}</p>}
            {group.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active ? "bg-pst-red text-white shadow-sm" : "text-white/75 hover:bg-white/10 hover:text-white",
                  )}
                >
                  <item.icon className="size-4.5 shrink-0" />
                  {t(`nav.${item.key}`)}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );

  const sidebar = (
    <div className="flex h-full flex-col bg-pst-ink text-white">
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
        <Emblem size={40} />
        <div className="min-w-0 leading-tight">
          <p className="font-display text-lg font-extrabold uppercase tracking-wide">SIM-PST</p>
          <p className="truncate text-[0.7rem] text-pst-gold">Pelo Progresso, Igualdade</p>
        </div>
      </div>
      {nav}
      <div className="border-t border-white/10 p-3">
        <a href="/" target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-md px-3 py-2 text-xs text-white/60 hover:bg-white/10 hover:text-white">
          <ExternalLink className="size-3.5" />
          {t("nav.viewSite")}
        </a>
      </div>
    </div>
  );

  return (
    <div className={cn(dark && "dark")}>
      <div className="flex min-h-dvh bg-surface text-foreground">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 lg:block">{sidebar}</aside>

        {/* Mobile drawer */}
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-xl">
              {sidebar}
              <button onClick={() => setOpen(false)} className="absolute right-2 top-3 rounded p-2 text-white/70 hover:bg-white/10" aria-label={tc("actions.close")}>
                <X className="size-5" />
              </button>
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur sm:px-5">
            <button className="rounded-md p-2 hover:bg-muted lg:hidden" onClick={() => setOpen(true)} aria-label="Menu">
              <Menu className="size-5" />
            </button>
            <span className="hidden truncate text-xs font-medium text-muted-foreground sm:block">{scopeLabel}</span>
            <div className="ml-auto flex items-center gap-1 sm:gap-3">
              <LocaleSwitcher />
              <button onClick={toggleTheme} className="rounded-md p-2 hover:bg-muted" aria-label={dark ? t("theme.light") : t("theme.dark")} title={dark ? t("theme.light") : t("theme.dark")}>
                {dark ? <Sun className="size-4.5" /> : <Moon className="size-4.5" />}
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-2 rounded-full p-0.5 pr-2 hover:bg-muted cursor-pointer">
                  <span className="flex size-8 items-center justify-center rounded-full bg-pst-red text-xs font-bold text-white">
                    {user.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                  </span>
                  <span className="hidden max-w-36 truncate text-sm font-medium md:block">{user.name}</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>
                    <span className="block truncate text-foreground">{user.email}</span>
                    <span className="font-normal">{tc(`enums.role.${user.role}`)}</span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/admin/account">
                      <UserCog /> {t("nav.account")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem destructive onSelect={logout}>
                    <LogOut /> {tc("actions.logout")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-3 py-5 sm:px-6 sm:py-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
