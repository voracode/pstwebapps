import { getTranslations } from "next-intl/server";
import { Megaphone } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { formatDate } from "@/lib/format";
import type { PostCardData } from "@/components/public/cards";

/**
 * Strip of the latest political statements. Scrolls as a marquee (paused
 * on hover/focus); with reduced motion it becomes a plain scrollable row.
 */
export async function StatementTicker({ items, locale }: { items: PostCardData[]; locale: string }) {
  if (items.length === 0) return null;
  const t = await getTranslations("public.home");
  const loop = items.length > 1;

  const list = (hidden: boolean) => (
    <ul className="flex shrink-0 items-center gap-8 pr-8" aria-hidden={hidden || undefined}>
      {items.map((p) => (
        <li key={p.id} className="flex shrink-0 items-center gap-3 whitespace-nowrap text-sm">
          <span className="text-pst-gold" aria-hidden>
            ★
          </span>
          {p.publishedAt && <span className="text-xs font-semibold uppercase text-white/60">{formatDate(p.publishedAt, locale, { day: "numeric", month: "short" })}</span>}
          <Link href={`/news/${p.slug}`} tabIndex={hidden ? -1 : undefined} className="font-semibold text-white hover:text-pst-gold hover:underline">
            {p.title}
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <section aria-label={t("statements")} className="relative flex items-stretch bg-pst-ink text-white">
      <h2 className="z-10 flex shrink-0 items-center gap-2 bg-pst-red px-4 py-3 font-sans text-xs font-bold uppercase tracking-wider">
        <Megaphone className="size-4" aria-hidden />
        <span className="hidden sm:inline">{t("statements")}</span>
      </h2>
      <div className="group relative flex-1 overflow-x-auto py-3 pl-6 [scrollbar-width:none] motion-safe:overflow-hidden">
        <div className={loop ? "flex w-max motion-safe:animate-marquee group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused]" : "flex w-max"}>
          {list(false)}
          {loop && <div className="hidden motion-safe:flex">{list(true)}</div>}
        </div>
      </div>
    </section>
  );
}
