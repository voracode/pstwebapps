import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth/server";
import { isMunicipalScoped } from "@/lib/security/rbac";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { EventForm } from "@/components/admin/events/event-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events");
  return { title: t("new") };
}

export default async function NewEventPage() {
  const auth = await requireAdmin("event:write", "/admin/events/new");
  const t = await getTranslations("events");
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t("new")} breadcrumb={<Link href="/admin/events" className="hover:underline">{t("title")}</Link>} />
      <EventForm lockMunicipalityId={isMunicipalScoped(auth.user) ? auth.user.municipalityId : null} />
    </div>
  );
}
