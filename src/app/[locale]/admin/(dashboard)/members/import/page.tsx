import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth/server";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { ImportWizard } from "@/components/admin/members/import-wizard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("members.import");
  return { title: t("title") };
}

export default async function ImportMembersPage() {
  await requireAdmin("member:import", "/admin/members/import");
  const t = await getTranslations("members");
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t("import.title")}
        description={t("import.description")}
        breadcrumb={<Link href="/admin/members" className="hover:underline">{t("title")}</Link>}
      />
      <ImportWizard />
    </div>
  );
}
