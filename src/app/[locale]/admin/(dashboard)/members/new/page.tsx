import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth/server";
import { isMunicipalScoped } from "@/lib/security/rbac";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { MemberForm } from "@/components/admin/members/member-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("members");
  return { title: t("new") };
}

export default async function NewMemberPage() {
  const auth = await requireAdmin("member:create", "/admin/members/new");
  const t = await getTranslations("members");
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={t("new")}
        description={t("form.createDescription")}
        breadcrumb={<Link href="/admin/members" className="hover:underline">{t("title")}</Link>}
      />
      <MemberForm lockMunicipalityId={isMunicipalScoped(auth.user) ? auth.user.municipalityId : null} />
    </div>
  );
}
