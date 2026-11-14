import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Search, ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { PageBody, PageHeader } from "@/components/public/page-header";
import { JoinWizard } from "@/components/public/join-wizard";
import { alternatesFor, asLocale } from "@/components/public/locale";
import { getSetting } from "@/lib/settings";
import { listGeo } from "@/server/services/geo.service";

export const revalidate = 300;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "public.join" });
  return { title: t("title"), description: t("lead"), alternates: alternatesFor(locale, "/join") };
}

export default async function JoinPage({ params }: Props) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("public");
  const [minAge, municipalities] = await Promise.all([getSetting<number>("membership.minimumAge", 17), listGeo("municipality")]);

  return (
    <>
      <PageHeader eyebrow="E-KTA" title={t("join.title")} lead={t("join.lead")} crumbs={[{ label: t("nav.join") }]}>
        <p className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/85">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-4 text-pst-gold" aria-hidden />
            {t("join.minAge", { age: minAge })}
          </span>
          <Link href="/membership-status" className="inline-flex items-center gap-1.5 underline underline-offset-4 hover:text-white">
            <Search className="size-4" aria-hidden />
            {t("home.checkStatus")}
          </Link>
        </p>
      </PageHeader>
      <PageBody>
        <JoinWizard minAge={minAge} municipalities={municipalities.map((m) => ({ id: m.id, name: m.name }))} />
        <p className="mx-auto mt-8 max-w-3xl text-center text-xs text-muted-foreground">{t("footer.privacy")}</p>
      </PageBody>
    </>
  );
}
