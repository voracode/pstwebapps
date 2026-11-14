import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageBody, PageHeader } from "@/components/public/page-header";
import { AspirationForm } from "@/components/public/aspiration-form";
import { AspirationTracker } from "@/components/public/aspiration-tracker";
import { alternatesFor, asLocale, sp } from "@/components/public/locale";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "public.voice" });
  return { title: t("title"), description: t("lead"), alternates: alternatesFor(locale, "/voice") };
}

export default async function VoicePage({ params, searchParams }: Props) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const ticket = sp((await searchParams).ticket)?.toUpperCase();
  const t = await getTranslations("public");

  return (
    <>
      <PageHeader title={t("voice.title")} lead={t("voice.lead")} crumbs={[{ label: t("nav.voice") }]}>
        <a href="#track" className="text-sm font-semibold text-white underline underline-offset-4 hover:text-pst-gold">
          {t("voice.trackTitle")} ↓
        </a>
      </PageHeader>
      <PageBody>
        <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr] lg:items-start">
          <AspirationForm />
          <div className="lg:sticky lg:top-24">
            <AspirationTracker initialTicket={ticket && /^ASP-\d{4}-[0-9A-Z]{6}$/.test(ticket) ? ticket : undefined} />
          </div>
        </div>
        <p className="mt-8 text-center text-xs text-muted-foreground">{t("footer.privacy")}</p>
      </PageBody>
    </>
  );
}
