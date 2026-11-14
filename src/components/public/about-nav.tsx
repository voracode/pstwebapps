import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils/cn";

const ITEMS = [
  { href: "/about", key: "overview" },
  { href: "/about/program", key: "program" },
  { href: "/about/statute", key: "statute" },
  { href: "/about/leadership", key: "leadership" },
] as const;

/** Sub-navigation shared by the About pages. */
export async function AboutNav({ current }: { current: (typeof ITEMS)[number]["href"] }) {
  const t = await getTranslations("public.nav");
  return (
    <nav aria-label={t("about")} className="border-b bg-background">
      <ul className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 [scrollbar-width:none]">
        {ITEMS.map((i) => (
          <li key={i.href} className="shrink-0">
            <Link
              href={i.href}
              aria-current={i.href === current ? "page" : undefined}
              className={cn(
                "inline-block border-b-2 px-3 py-3 text-sm font-semibold transition-colors",
                i.href === current ? "border-pst-red text-pst-red" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t(i.key)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
