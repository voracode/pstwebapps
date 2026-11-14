import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { listUsers } from "@/server/services/user.service";
import { PageHeader } from "@/components/admin/page-header";
import { Input, Label, NativeSelect } from "@/components/ui/form-controls";
import { Pagination, pageHref } from "@/components/ui/pagination";
import { FilterForm, oneOf, pageNumber, sp } from "@/components/admin/cms/filter-form";
import { UsersManager, type UserRow } from "@/components/admin/users/users-manager";

const PAGE_SIZE = 25;
const ROLES = ["SUPER_ADMIN", "NATIONAL_SECRETARY", "MUNICIPAL_COORDINATOR", "MEDIA_EDITOR", "AUDITOR"] as const;
const STATUSES = ["ACTIVE", "DISABLED"] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("users");
  return { title: t("title") };
}

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const auth = await requireAdmin("user:manage");
  const params = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations("users");
  const tc = await getTranslations("common");

  const filters = {
    role: oneOf(sp(params, "role"), ROLES),
    status: oneOf(sp(params, "status"), STATUSES),
    q: sp(params, "q")?.slice(0, 100),
  };
  const page = pageNumber(sp(params, "page"));
  const [{ items, total }, municipalities] = await Promise.all([
    listUsers(filters, (page - 1) * PAGE_SIZE, PAGE_SIZE),
    db.municipality.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);
  const now = Date.now();
  const rows: UserRow[] = items.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    phone: u.phone,
    role: u.role,
    status: u.status,
    municipalityId: u.municipalityId,
    municipalityName: u.municipality?.name ?? null,
    twoFactorEnabled: u.twoFactorEnabled,
    mustChangePassword: u.mustChangePassword,
    locked: !!u.lockedUntil && u.lockedUntil.getTime() > now,
    lockedUntil: u.lockedUntil?.toISOString() ?? null,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    lastLoginIp: u.lastLoginIp,
    telegramChatId: u.telegramChatId,
    createdAt: u.createdAt.toISOString(),
  }));
  const base = `/${locale}/admin/users`;

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <FilterForm action={base} submitLabel={tc("actions.filter")} clearLabel={tc("actions.clear")} showClear={Object.values(filters).some(Boolean)}>
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-2">
          <Label htmlFor="f-q">{tc("actions.search")}</Label>
          <Input id="f-q" name="q" type="search" defaultValue={filters.q ?? ""} placeholder={t("searchPlaceholder")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-role">{t("role")}</Label>
          <NativeSelect id="f-role" name="role" defaultValue={filters.role ?? ""}>
            <option value="">{tc("states.all")}</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {tc(`enums.role.${r}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-status">{t("status")}</Label>
          <NativeSelect id="f-status" name="status" defaultValue={filters.status ?? ""}>
            <option value="">{tc("states.all")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`statuses.${s}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
      </FilterForm>
      <p className="mb-2 text-sm text-muted-foreground">{tc("pagination.total", { count: total })}</p>
      <UsersManager users={rows} municipalities={municipalities} currentUserId={auth.user.id} />
      <Pagination
        className="mt-4"
        page={page}
        pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
        hrefFor={(n) => pageHref(base, params, n)}
        labels={{ previous: tc("actions.previous"), next: tc("actions.next"), page: (p, n) => tc("pagination.page", { page: p, total: n }) }}
      />
    </>
  );
}
