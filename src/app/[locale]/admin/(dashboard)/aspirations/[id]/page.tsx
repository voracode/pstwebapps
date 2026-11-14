import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { EyeOff, FileText, ImageIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { ApiError } from "@/lib/http";
import { can } from "@/lib/security/rbac";
import { getAspiration } from "@/server/services/aspiration.service";
import { assignableUsers } from "@/server/services/admin-lookup.service";
import { Link } from "@/i18n/navigation";
import { DetailList, PageHeader } from "@/components/admin/page-header";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { PriorityBadge, TicketStatusBadge } from "@/components/admin/aspirations/badges";
import { AspirationControls } from "@/components/admin/aspirations/aspiration-controls";
import { NotesThread } from "@/components/admin/aspirations/notes-thread";
import { formatBytes, formatDateTime } from "@/lib/format";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("aspirations");
  return { title: t("detailTitle") };
}

export default async function AspirationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAdmin("aspiration:read", `/admin/aspirations/${id}`);
  const t = await getTranslations("aspirations");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const canManage = can(auth.user.role, "aspiration:manage");

  const a = await getAspiration(auth, id).catch((err) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });
  const users = canManage ? await assignableUsers(auth) : [];

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href="/admin/aspirations" className="hover:underline">
            {t("title")}
          </Link>
        }
        title={a.ticketNumber}
        description={a.subject}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <TicketStatusBadge status={a.status} />
                <PriorityBadge priority={a.priority} />
                <Badge variant="outline">{tc(`enums.aspirationCategory.${a.category}`)}</Badge>
                <Badge variant="muted">{tc(`langName.${a.locale.toLowerCase() as "tet"}`)}</Badge>
              </div>
              <CardTitle className="pt-2">{a.subject}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="whitespace-pre-line break-words text-sm leading-relaxed">{a.message}</p>
              {a.attachments.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("attachments")}</p>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {a.attachments.map((f) => {
                      const isImage = f.mimeType?.startsWith("image/");
                      const Icon = isImage ? ImageIcon : FileText;
                      return (
                        <li key={f.id}>
                          {f.url ? (
                            <a href={f.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-md border p-2 text-sm hover:bg-muted">
                              {isImage ? (
                                // eslint-disable-next-line @next/next/no-img-element -- signed private URL
                                <img src={f.url} alt="" className="size-12 shrink-0 rounded object-cover" loading="lazy" />
                              ) : (
                                <Icon className="size-8 shrink-0 text-muted-foreground" aria-hidden />
                              )}
                              <span className="min-w-0">
                                <span className="block truncate font-medium">{f.originalName ?? t("attachment")}</span>
                                <span className="text-xs text-muted-foreground">{formatBytes(f.sizeBytes)}</span>
                              </span>
                            </a>
                          ) : (
                            <span className="text-sm text-muted-foreground">{f.originalName ?? t("attachment")}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("notes.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <NotesThread aspirationId={a.id} notes={a.notes} canManage={canManage} citizenEmail={!!a.email} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle>{t("controls.title")}</CardTitle>
              </CardHeader>
              <CardContent>
                <AspirationControls
                  id={a.id}
                  status={a.status}
                  priority={a.priority}
                  assignedTo={a.assignedTo}
                  currentUserId={auth.user.id}
                  users={users.map((u) => ({ id: u.id, name: u.name, municipality: u.municipality?.name ?? null }))}
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{t("submitter.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              {a.isAnonymous ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <EyeOff className="size-4" aria-hidden />
                  {t("submitter.anonymous")}
                </p>
              ) : (
                <DetailList
                  className="sm:grid-cols-1"
                  items={[
                    { label: t("submitter.name"), value: a.name },
                    { label: t("submitter.type"), value: tc(`enums.submitterType.${a.submitterType}`) },
                    { label: t("submitter.phone"), value: a.phone ? <a href={`tel:${a.phone}`} className="hover:underline">{a.phone}</a> : null },
                    { label: t("submitter.email"), value: a.email ? <a href={`mailto:${a.email}`} className="break-all hover:underline">{a.email}</a> : null },
                  ]}
                />
              )}
              <DetailList
                className="mt-4 border-t pt-4 sm:grid-cols-1"
                items={[
                  ...(a.isAnonymous ? [{ label: t("submitter.type"), value: tc(`enums.submitterType.${a.submitterType}`) }] : []),
                  { label: tc("geo.municipality"), value: a.municipality?.name },
                  { label: tc("geo.suco"), value: a.suco?.name },
                  { label: t("fields.received"), value: formatDateTime(a.createdAt, locale) },
                  { label: t("fields.acknowledged"), value: a.acknowledgedAt ? formatDateTime(a.acknowledgedAt, locale) : null },
                  { label: t("fields.resolved"), value: a.resolvedAt ? formatDateTime(a.resolvedAt, locale) : null },
                  ...(!canManage ? [{ label: t("fields.assignedTo"), value: a.assignedTo?.name }] : []),
                ]}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
