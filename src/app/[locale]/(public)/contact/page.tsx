import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, Clock, Mail, MapPin, Megaphone, Phone } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { PageBody, PageHeader } from "@/components/public/page-header";
import { ContactForm } from "@/components/public/contact-form";
import { SocialIcon, SOCIAL_LABEL } from "@/components/public/social-icons";
import { alternatesFor, asLocale } from "@/components/public/locale";
import { getSiteContact } from "@/server/services/public-site.service";

export const revalidate = 300;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "public.contact" });
  return { title: t("title"), description: t("lead"), alternates: alternatesFor(locale, "/contact") };
}

export default async function ContactPage({ params }: Props) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("public");
  const { headquarters: hq, social } = await getSiteContact(locale);
  const hasHq = !!(hq.address || hq.phone || hq.email || hq.whatsapp);
  const wa = hq.whatsapp?.replace(/[^\d]/g, "");

  return (
    <>
      <PageHeader title={t("contact.title")} lead={t("contact.lead")} crumbs={[{ label: t("nav.contact") }]} />
      <PageBody>
        <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr] lg:items-start">
          <ContactForm />
          <aside className="space-y-5">
            <section aria-labelledby="hq-h" className="rounded-xl bg-pst-ink p-6 text-white">
              <h2 id="hq-h" className="mb-4 text-2xl font-extrabold uppercase">
                {t("contact.hqTitle")}
              </h2>
              {hasHq ? (
                <dl className="space-y-3 text-sm">
                  {hq.address && (
                    <div className="flex gap-3">
                      <dt>
                        <MapPin className="size-5 text-pst-gold" aria-label={t("contact.address")} />
                      </dt>
                      <dd className="whitespace-pre-line">{hq.address}</dd>
                    </div>
                  )}
                  {hq.phone && (
                    <div className="flex gap-3">
                      <dt>
                        <Phone className="size-5 text-pst-gold" aria-label={t("contact.phone")} />
                      </dt>
                      <dd>
                        <a href={`tel:${hq.phone.replace(/\s/g, "")}`} className="hover:text-pst-gold">
                          {hq.phone}
                        </a>
                      </dd>
                    </div>
                  )}
                  {hq.whatsapp && wa && (
                    <div className="flex gap-3">
                      <dt>
                        <SocialIcon name="whatsapp" className="size-5 text-pst-gold" aria-label={t("contact.whatsapp")} />
                      </dt>
                      <dd>
                        <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="hover:text-pst-gold">
                          {hq.whatsapp}
                        </a>
                      </dd>
                    </div>
                  )}
                  {hq.email && (
                    <div className="flex gap-3">
                      <dt>
                        <Mail className="size-5 text-pst-gold" aria-label={t("contact.email")} />
                      </dt>
                      <dd className="break-all">
                        <a href={`mailto:${hq.email}`} className="hover:text-pst-gold">
                          {hq.email}
                        </a>
                      </dd>
                    </div>
                  )}
                  {hq.hours && (
                    <div className="flex gap-3">
                      <dt>
                        <Clock className="size-5 text-pst-gold" aria-label={t("contact.hours")} />
                      </dt>
                      <dd>{hq.hours}</dd>
                    </div>
                  )}
                </dl>
              ) : (
                <p className="text-sm text-white/80">{t("contact.noHq")}</p>
              )}
              {social.length > 0 && (
                <div className="mt-5 border-t border-white/15 pt-4">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-pst-gold">{t("footer.follow")}</p>
                  <ul className="flex flex-wrap gap-2">
                    {social.map((s) => (
                      <li key={s.key}>
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer me"
                          className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm hover:bg-pst-red"
                        >
                          <SocialIcon name={s.key} className="size-4" />
                          {SOCIAL_LABEL[s.key]}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
            <Link href="/municipalities" className="group flex items-center justify-between gap-3 rounded-xl border bg-card p-5 shadow-sm hover:border-pst-red">
              <span className="flex items-center gap-3 font-display text-lg font-bold">
                <MapPin className="size-6 text-pst-red" aria-hidden />
                {t("contact.municipal")}
              </span>
              <ArrowRight className="size-5 text-pst-red transition-transform group-hover:translate-x-1" aria-hidden />
            </Link>
            <Link href="/voice" className="group flex items-start gap-3 rounded-xl border bg-card p-5 shadow-sm hover:border-pst-red">
              <Megaphone className="size-6 shrink-0 text-pst-red" aria-hidden />
              <span>
                <span className="block font-display text-lg font-bold">{t("nav.voice")}</span>
                <span className="block text-sm text-muted-foreground">{t("contact.voiceHint")}</span>
              </span>
            </Link>
          </aside>
        </div>
      </PageBody>
    </>
  );
}
