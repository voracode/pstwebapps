import { getLocale, getTranslations } from "next-intl/server";
import { clientUser, requireAdmin } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { PageHeader, DetailList } from "@/components/admin/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/format";
import { AccountSecurity } from "./account-security";

export default async function AccountPage() {
  const auth = await requireAdmin();
  const t = await getTranslations("admin.account");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const user = await db.user.findUniqueOrThrow({
    where: { id: auth.user.id },
    select: { lastLoginAt: true, lastLoginIp: true, passwordChangedAt: true, municipality: { select: { name: true } }, _count: { select: { recoveryCodes: { where: { usedAt: null } } } } },
  });

  return (
    <>
      <PageHeader title={t("title")} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("profile")}</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailList
              items={[
                { label: t("name"), value: auth.user.name },
                { label: t("email"), value: auth.user.email },
                { label: t("role"), value: tc(`enums.role.${auth.user.role}`) },
                { label: t("municipality"), value: user.municipality?.name ?? "—" },
                { label: t("lastLogin"), value: `${formatDateTime(user.lastLoginAt, locale)}${user.lastLoginIp ? ` · ${user.lastLoginIp}` : ""}` },
                { label: t("passwordChanged"), value: formatDateTime(user.passwordChangedAt, locale) },
              ]}
            />
          </CardContent>
        </Card>
        <AccountSecurity user={clientUser(auth)} recoveryCodesLeft={user._count.recoveryCodes} />
      </div>
    </>
  );
}
