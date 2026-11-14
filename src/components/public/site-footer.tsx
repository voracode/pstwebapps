import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Emblem, Stars } from "@/components/brand/emblem";
import { SocialIcon, SOCIAL_LABEL } from "@/components/public/social-icons";
import type { getSiteContact } from "@/server/services/public-site.service";

type Contact = Awaited<ReturnType<typeof getSiteContact>>;

export async function SiteFooter({ contact }: { contact: Contact }) {
  const t = await getTranslations("public");
  const groups = [
    {
      title: t("footer.party"),
      links: [
        { href: "/about", label: t("nav.about") },
        { href: "/about/program", label: t("nav.program") },
        { href: "/about/statute", label: t("nav.statute") },
        { href: "/about/leadership", label: t("nav.leadership") },
        { href: "/municipalities", label: t("nav.municipalities") },
      ],
    },
    {
      title: t("footer.participate"),
      links: [
        { href: "/join", label: t("nav.join") },
        { href: "/membership-status", label: t("nav.membershipStatus") },
        { href: "/voice", label: t("nav.voice") },
        { href: "/events", label: t("nav.events") },
        { href: "/contact", label: t("nav.contact") },
      ],
    },
    {
      title: t("footer.information"),
      links: [
        { href: "/news", label: t("nav.news") },
        { href: "/press", label: t("nav.press") },
        { href: "/media", label: t("nav.media") },
        { href: "/documents", label: t("nav.documents") },
      ],
    },
  ];

  return (
    <footer className="mt-auto bg-pst-ink text-white">
      <div className="h-1 bg-gradient-to-r from-pst-red via-pst-gold to-pst-red" aria-hidden />
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Emblem size={56} />
            <div>
              <p className="font-display text-2xl font-extrabold uppercase leading-none">PST</p>
              <p className="text-sm text-white/70">{t("meta.name")}</p>
            </div>
          </div>
          <p className="flex items-center gap-2 font-display text-xl font-bold italic text-pst-gold" lang="pt">
            <Stars />
            {contact.motto}
          </p>
          <p className="max-w-sm text-sm text-white/70">{t("footer.about")}</p>
          {contact.social.length > 0 && (
            <div>
              <p className="sr-only">{t("footer.follow")}</p>
              <ul className="flex flex-wrap gap-2">
                {contact.social.map((s) => (
                  <li key={s.key}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer me"
                      aria-label={SOCIAL_LABEL[s.key]}
                      className="flex size-9 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-pst-red"
                    >
                      <SocialIcon name={s.key} />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        {groups.map((g) => (
          <nav key={g.title} aria-label={g.title}>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.15em] text-pst-gold">{g.title}</h2>
            <ul className="space-y-2 text-sm">
              {g.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-white/80 transition-colors hover:text-white">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl">{t("footer.privacy")}</p>
          <div className="flex shrink-0 items-center gap-4">
            <span>{t("footer.rights", { year: new Date().getFullYear() })}</span>
            <Link href="/admin" className="text-white/40 hover:text-white" rel="nofollow">
              {t("nav.backoffice")}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
