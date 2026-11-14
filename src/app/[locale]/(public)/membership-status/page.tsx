import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { PageBody, PageHeader } from "@/components/public/page-header";
import { StatusCheck } from "@/components/public/status-check";
import { alternatesFor, asLocale, sp } from "@/components/public/locale";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "public.status" });
  return { title: t("title"), description: t("lead"), alternates: alternatesFor(locale, "/membership-status"), robots: { index: false, follow: true } };
}

export default async function MembershipStatusPage({ params, searchParams }: Props) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const ref = sp((await searchParams).ref)?.toUpperCase();
  const t = await getTranslations("public");

  return (
    <>
      <PageHeader eyebrow="E-KTA" title={t("status.title")} lead={t("status.lead")} crumbs={[{ label: t("nav.join"), href: "/join" }, { label: t("nav.membershipStatus") }]} />
      <PageBody>
        <StatusCheck initialRef={ref && /^REG-[0-9A-Z]{8}$/.test(ref) ? ref : undefined} />
        <div className="mx-auto mt-10 flex max-w-4xl flex-wrap items-center justify-between gap-3 rounded-xl bg-surface p-5">
          <p className="font-semibold">{t("status.noRef")}</p>
          <Link href="/join" className={buttonVariants()}>
            {t("home.joinCta")}
            <ArrowRight aria-hidden />
          </Link>
        </div>
      </PageBody>
    </>
  );
}
