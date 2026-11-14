import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Stars } from "@/components/brand/emblem";
import { cn } from "@/lib/utils/cn";

export interface Crumb {
  label: string;
  href?: string;
}

/** Title band at the top of every inner page (red/ink gradient). */
export async function PageHeader({
  title,
  lead,
  crumbs = [],
  eyebrow,
  children,
  className,
}: {
  title: ReactNode;
  lead?: ReactNode;
  crumbs?: Crumb[];
  eyebrow?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const t = await getTranslations("public.nav");
  return (
    <header className={cn("relative overflow-hidden bg-gradient-to-br from-pst-red-800 via-pst-red-900 to-pst-ink text-white", className)}>
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-pst-red/40 blur-3xl" />
      <div className="relative mx-auto max-w-6xl px-4 py-10 sm:py-14">
        <nav aria-label={t("breadcrumb")} className="mb-4">
          <ol className="flex flex-wrap items-center gap-1 text-xs text-white/70">
            <li>
              <Link href="/" className="hover:text-white">
                {t("home")}
              </Link>
            </li>
            {crumbs.map((c, i) => (
              <li key={i} className="flex items-center gap-1">
                <ChevronRight className="size-3" aria-hidden />
                {c.href ? (
                  <Link href={c.href} className="hover:text-white">
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="line-clamp-1 text-white/90">
                    {c.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
        {eyebrow && (
          <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-pst-gold">
            <Stars className="text-[0.7rem]" />
            {eyebrow}
          </p>
        )}
        <h1 className="max-w-4xl text-4xl font-extrabold uppercase leading-[1.05] sm:text-5xl">{title}</h1>
        {lead && <p className="mt-3 max-w-2xl text-base text-white/85 sm:text-lg">{lead}</p>}
        {children && <div className="mt-6">{children}</div>}
      </div>
    </header>
  );
}

/** Standard page body container. */
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto max-w-6xl px-4 py-10 sm:py-14", className)}>{children}</div>;
}
