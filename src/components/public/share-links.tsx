import { getTranslations } from "next-intl/server";
import { SocialIcon } from "@/components/public/social-icons";
import { CopyButton } from "@/components/public/copy-button";
import { cn } from "@/lib/utils/cn";

function networksFor(url: string, title: string) {
  const u = encodeURIComponent(url);
  const text = encodeURIComponent(title);
  return [
    { key: "facebook", label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${u}`, bar: "bg-[#1877F2] hover:bg-[#0f63d4]" },
    { key: "whatsapp", label: "WhatsApp", href: `https://wa.me/?text=${text}%20${u}`, bar: "bg-[#128C7E] hover:bg-[#0e6f64]" },
    { key: "telegram", label: "Telegram", href: `https://t.me/share/url?url=${u}&text=${text}`, bar: "bg-[#1f8fc7] hover:bg-[#1878a8]" },
    { key: "x", label: "X", href: `https://x.com/intent/post?url=${u}&text=${text}`, bar: "bg-pst-ink hover:bg-pst-ink-700" },
  ];
}

/** Plain share links (no third-party scripts) + copy-link button. */
export async function ShareLinks({ url, title }: { url: string; title: string }) {
  const t = await getTranslations("public.news");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("share")}</span>
      {networksFor(url, title).map((n) => (
        <a
          key={n.key}
          href={n.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("shareOn", { network: n.label })}
          title={t("shareOn", { network: n.label })}
          className="flex size-9 items-center justify-center rounded-full border text-foreground/80 transition-colors hover:border-pst-red hover:bg-pst-red hover:text-white"
        >
          <SocialIcon name={n.key} />
        </a>
      ))}
      <CopyButton value={url} label={t("copyLink")} className="rounded-full" />
    </div>
  );
}

/** Labelled share bar used under articles ("Share this story: [Facebook] [WhatsApp] …"). */
export async function ShareBar({ url, title, className }: { url: string; title: string; className?: string }) {
  const t = await getTranslations("public.news");
  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border border-l-4 border-l-pst-red bg-surface p-4 xl:flex-row xl:items-center xl:justify-between", className)}>
      <span className="shrink-0 font-display text-sm font-extrabold uppercase tracking-wider text-pst-ink-800 dark:text-foreground">{t("shareThis")}</span>
      <div className="flex flex-wrap items-center gap-2">
        {networksFor(url, title).map((n) => (
          <a
            key={n.key}
            href={n.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("shareOn", { network: n.label })}
            className={cn("inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-bold text-white transition-colors", n.bar)}
          >
            <SocialIcon name={n.key} width={15} height={15} />
            <span className={n.key === "x" ? "sr-only" : undefined}>{n.label}</span>
          </a>
        ))}
        <CopyButton value={url} label={t("copyLink")} className="h-9 border-pst-red/40 text-xs font-bold text-pst-red hover:bg-pst-red hover:text-white" />
      </div>
    </div>
  );
}
