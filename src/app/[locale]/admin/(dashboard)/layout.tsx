import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { clientUser, requireAdmin } from "@/lib/auth/server";
import { AdminShell } from "@/components/admin/shell";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Every backoffice page depends on the session cookie.
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const auth = await requireAdmin();
  const t = await getTranslations("admin");
  let scopeLabel = t("scopeNational");
  if (auth.user.role === "MUNICIPAL_COORDINATOR" && auth.user.municipalityId) {
    const m = await db.municipality.findUnique({ where: { id: auth.user.municipalityId }, select: { name: true } });
    scopeLabel = t("scopeMunicipality", { name: m?.name ?? "—" });
  }
  const dark = (await cookies()).get("pst-admin-theme")?.value === "dark";

  return (
    <AdminShell user={clientUser(auth)} scopeLabel={scopeLabel} initialDark={dark}>
      {children}
    </AdminShell>
  );
}
