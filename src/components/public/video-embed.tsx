"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CirclePlay, ExternalLink } from "lucide-react";

const PROVIDER_NAME = { youtube: "YouTube", vimeo: "Vimeo", facebook: "Facebook" } as const;

/**
 * Click-to-load video: no third-party request (cookies, thumbnails) until
 * the visitor presses play.
 */
export function VideoEmbed({
  provider,
  embedUrl,
  sourceUrl,
  title,
}: {
  provider: keyof typeof PROVIDER_NAME;
  embedUrl: string;
  sourceUrl: string;
  title: string;
}) {
  const t = useTranslations("public.media");
  const [active, setActive] = useState(false);
  const name = PROVIDER_NAME[provider];

  return (
    <figure className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="relative aspect-video bg-pst-ink">
        {active ? (
          <iframe
            src={embedUrl}
            title={title}
            className="absolute inset-0 size-full"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <button
            type="button"
            onClick={() => setActive(true)}
            className="group absolute inset-0 flex size-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-pst-red-800 via-pst-ink to-pst-ink p-4 text-center text-white"
          >
            <CirclePlay className="size-16 text-pst-gold transition-transform group-hover:scale-110 motion-reduce:transform-none" aria-hidden strokeWidth={1.5} />
            <span className="font-display text-lg font-bold">{t("play")}</span>
            <span className="max-w-xs text-xs text-white/70">{t("consent", { provider: name })}</span>
          </button>
        )}
      </div>
      <figcaption className="flex items-start justify-between gap-3 p-3">
        <span className="font-medium leading-snug">{title}</span>
        <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-pst-red">
          {t("openOriginal", { provider: name })}
          <ExternalLink className="size-3" aria-hidden />
        </a>
      </figcaption>
    </figure>
  );
}
