import { getTranslations } from "next-intl/server";
import { ArrowRight, Megaphone } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Emblem, Stars } from "@/components/brand/emblem";
import { buttonVariants } from "@/components/ui/button";
import { MediaImage } from "@/components/public/media-image";
import { FadeIn } from "@/components/public/fade-in";
import { cn } from "@/lib/utils/cn";
import type { HeroSlideDto } from "@/server/services/public-site.service";

const MOTTO = "Pelo Progresso, Igualdade";

function isInternal(href: string) {
  return href.startsWith("/") && !href.startsWith("//");
}

/**
 * Home hero. With an active HeroSlide the first one drives headline, image
 * and CTA; additional slides appear as a compact strip below. Without slides
 * it falls back to the party identity (emblem, name, motto).
 */
export async function Hero({ slides }: { slides: HeroSlideDto[] }) {
  const t = await getTranslations("public");
  const main = slides[0];
  const others = slides.slice(1, 4);

  return (
    <section className="relative isolate overflow-hidden bg-pst-ink text-white" aria-labelledby="hero-title">
      {main?.image ? (
        <>
          <MediaImage
            src={main.image.url}
            alt=""
            blurDataUrl={main.image.blurDataUrl}
            eager
            className="absolute inset-0 -z-20 size-full"
          />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-pst-ink/95 via-pst-red-900/85 to-pst-red/40" aria-hidden />
        </>
      ) : (
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-pst-red via-pst-red-800 to-pst-ink" aria-hidden>
          <div className="absolute -left-24 top-10 size-96 rounded-full bg-pst-red-500/40 blur-3xl" />
          <div className="absolute -bottom-32 right-0 size-[28rem] rounded-full bg-pst-ink/70 blur-3xl" />
          <svg className="absolute inset-0 size-full opacity-[0.06]" aria-hidden>
            <defs>
              <pattern id="hero-stars" width="56" height="56" patternUnits="userSpaceOnUse">
                <text x="0" y="28" fontSize="18" fill="#facc15">★</text>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#hero-stars)" />
          </svg>
        </div>
      )}

      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:py-20 lg:grid-cols-[1.5fr_1fr] lg:py-24">
        <FadeIn>
          <p className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.25em] text-pst-gold">
            <Stars className="text-sm" />
            {t("home.heroEyebrow")}
          </p>
          <h1 id="hero-title" className="font-display text-5xl font-extrabold uppercase leading-[0.95] sm:text-6xl lg:text-7xl">
            {main ? (
              main.headline
            ) : (
              <span lang="pt">
                Pelo Progresso,
                <br />
                <span className="text-pst-gold">Igualdade</span>
              </span>
            )}
          </h1>
          {main && (
            <p className="mt-4 font-display text-2xl font-bold italic text-pst-gold" lang="pt">
              {MOTTO}
            </p>
          )}
          <p className="mt-5 max-w-xl text-lg text-white/85">{main?.subline || t("home.heroLead")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            {main?.ctaHref && main.ctaLabel ? (
              isInternal(main.ctaHref) ? (
                <Link href={main.ctaHref} className={buttonVariants({ variant: "gold", size: "lg" })}>
                  {main.ctaLabel}
                  <ArrowRight aria-hidden />
                </Link>
              ) : (
                <a href={main.ctaHref} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "gold", size: "lg" })}>
                  {main.ctaLabel}
                  <ArrowRight aria-hidden />
                </a>
              )
            ) : null}
            <Link
              href="/join"
              className={cn(buttonVariants({ size: "lg" }), "bg-white text-pst-red font-bold uppercase tracking-wide hover:bg-pst-red-50")}
            >
              {t("home.ctaJoin")}
              <ArrowRight aria-hidden />
            </Link>
            <Link href="/voice" className={cn(buttonVariants({ variant: "outline-light", size: "lg" }), "font-bold")}>
              <Megaphone aria-hidden />
              {t("home.ctaVoice")}
            </Link>
          </div>
        </FadeIn>

        <FadeIn delay={0.15} className="hidden justify-center lg:flex">
          <div className="relative">
            <div className="absolute inset-0 -z-10 scale-110 rounded-full bg-pst-gold/20 blur-2xl" aria-hidden />
            <Emblem size={320} priority className="drop-shadow-2xl" />
          </div>
        </FadeIn>
      </div>

      {others.length > 0 && (
        <div className="border-t border-white/10 bg-pst-ink/60 backdrop-blur">
          <ul className="mx-auto grid max-w-6xl gap-px px-4 sm:grid-cols-3">
            {others.map((s) => (
              <li key={s.id} className="py-4 sm:px-4 sm:first:pl-0">
                {s.ctaHref ? (
                  isInternal(s.ctaHref) ? (
                    <Link href={s.ctaHref} className="group block">
                      <p className="font-display text-lg font-bold leading-tight group-hover:text-pst-gold">{s.headline}</p>
                      {s.subline && <p className="line-clamp-2 text-sm text-white/70">{s.subline}</p>}
                    </Link>
                  ) : (
                    <a href={s.ctaHref} target="_blank" rel="noopener noreferrer" className="group block">
                      <p className="font-display text-lg font-bold leading-tight group-hover:text-pst-gold">{s.headline}</p>
                      {s.subline && <p className="line-clamp-2 text-sm text-white/70">{s.subline}</p>}
                    </a>
                  )
                ) : (
                  <>
                    <p className="font-display text-lg font-bold leading-tight">{s.headline}</p>
                    {s.subline && <p className="line-clamp-2 text-sm text-white/70">{s.subline}</p>}
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
