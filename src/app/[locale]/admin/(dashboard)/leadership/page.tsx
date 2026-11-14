import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Building2, Users } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { can } from "@/lib/security/rbac";
import { db } from "@/lib/db";
import { listLeadership } from "@/server/services/content.service";
import { PageHeader } from "@/components/admin/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { sp } from "@/components/admin/cms/filter-form";
import { LeadershipManager, type LeadershipRow } from "@/components/admin/cms/leadership-manager";
import { BranchManager, type BranchRow } from "@/components/admin/cms/branch-manager";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("cms.leadership");
  return { title: t("title") };
}

export default async function LeadershipPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const auth = await requireAdmin("post:read");
  const params = await searchParams;
  const t = await getTranslations("cms");
  const canWrite = can(auth.user.role, "leadership:write");

  const [leaders, branches, municipalities] = await Promise.all([
    listLeadership({}),
    db.branchOffice.findMany({
      orderBy: [{ isHeadquarters: "desc" }, { name: "asc" }],
      include: { adminPost: { select: { name: true } }, coordinator: { select: { fullName: true } } },
    }),
    db.municipality.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);

  const rows: LeadershipRow[] = leaders.map((l) => ({
    id: l.id,
    level: l.level,
    municipalityId: l.municipalityId,
    municipalityName: l.municipality?.name ?? null,
    fullName: l.fullName,
    photoId: l.photoId,
    photoUrl: l.photoUrl,
    phone: l.phone,
    email: l.email,
    isCoordinator: l.isCoordinator,
    sortOrder: l.sortOrder,
    termStart: l.termStart,
    termEnd: l.termEnd,
    isActive: l.isActive,
    translations: l.translations.map((x) => ({ locale: x.locale, positionTitle: x.positionTitle, bio: x.bio })),
  }));

  const munName = new Map(municipalities.map((m) => [m.id, m.name]));
  const branchRows: BranchRow[] = branches.map((b) => ({
    id: b.id,
    municipalityId: b.municipalityId,
    municipalityName: munName.get(b.municipalityId) ?? "",
    adminPostId: b.adminPostId,
    adminPostName: b.adminPost?.name ?? null,
    coordinatorId: b.coordinatorId,
    coordinatorName: b.coordinator?.fullName ?? null,
    name: b.name,
    address: b.address,
    phone: b.phone,
    email: b.email,
    latitude: b.latitude != null ? Number(b.latitude) : null,
    longitude: b.longitude != null ? Number(b.longitude) : null,
    openingHours: (b.openingHours as Record<string, string> | null) ?? null,
    isHeadquarters: b.isHeadquarters,
    isActive: b.isActive,
  }));

  const coordinators = leaders
    .filter((l) => l.municipalityId != null)
    .map((l) => ({ id: l.id, fullName: l.fullName, municipalityId: l.municipalityId, isCoordinator: l.isCoordinator }));

  const tab = sp(params, "tab") === "branches" ? "branches" : "organs";

  return (
    <>
      <PageHeader title={t("leadership.title")} description={t("leadership.description")} />
      <Tabs defaultValue={tab}>
        <TabsList>
          <TabsTrigger value="organs">
            <Users className="size-4" aria-hidden />
            {t("leadership.organs")}
          </TabsTrigger>
          <TabsTrigger value="branches">
            <Building2 className="size-4" aria-hidden />
            {t("branches.title")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="organs">
          <LeadershipManager rows={rows} municipalities={municipalities} canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="branches">
          <BranchManager branches={branchRows} municipalities={municipalities} coordinators={coordinators} canWrite={canWrite} />
        </TabsContent>
      </Tabs>
    </>
  );
}
