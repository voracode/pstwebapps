import { getTranslations } from "next-intl/server";
import { SocialIcon } from "@/components/public/social-icons";
import { CopyButton } from "@/components/public/copy-button";

/** Plain share links (no third-party scripts) + copy-link button. */
export async function ShareLinks({ url, title }: { url: string; title: string }) {
  const t = await getTranslations("public.news");
  const u = encodeURIComponent(url);
  const text = encodeURIComponent(title);
  const networks = [
    { key: "facebook", label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { key: "whatsapp", label: "WhatsApp", href: `https://wa.me/?text=${text}%20${u}` },
    { key: "telegram", label: "Telegram", href: `https://t.me/share/url?url=${u}&text=${text}` },
    { key: "x", label: "X", href: `https://x.com/intent/post?url=${u}&text=${text}` },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("share")}</span>
      {networks.map((n) => (
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
