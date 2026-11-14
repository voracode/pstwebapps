import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth/server";
import { ApiError } from "@/lib/http";
import { requestContext } from "@/lib/request";
import { isMunicipalScoped } from "@/lib/security/rbac";
import { getMember } from "@/server/services/member.service";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { MemberForm } from "@/components/admin/members/member-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("members");
  return { title: t("edit") };
}

export default async function EditMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAdmin("member:update", `/admin/members/${id}/edit`);
  const t = await getTranslations("members");
  const member = await getMember(auth, id, { revealId: false }, requestContext(await headers())).catch((e) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={t("edit")}
        description={member.fullName}
        breadcrumb={
          <>
            <Link href="/admin/members" className="hover:underline">{t("title")}</Link>
            {" / "}
            <Link href={`/admin/members/${id}`} className="hover:underline">{member.memberNumber ?? member.registrationRef}</Link>
          </>
        }
      />
      <MemberForm member={member} lockMunicipalityId={isMunicipalScoped(auth.user) ? auth.user.municipalityId : null} />
    </div>
  );
}
