import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { CreditCard, History, UserRound } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { ApiError } from "@/lib/http";
import { requestContext } from "@/lib/request";
import { can } from "@/lib/security/rbac";
import { getMember, memberStatusHistory } from "@/server/services/member.service";
import { listCards } from "@/server/services/kta.service";
import { activeCardPreviewUrl } from "@/server/services/admin-lookup.service";
import { Link } from "@/i18n/navigation";
import { DetailList, PageHeader } from "@/components/admin/page-header";
import { Alert, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { MemberAvatar, MemberStatusBadge } from "@/components/admin/members/badges";
import { MemberActions } from "@/components/admin/members/member-actions";
import { RevealId } from "@/components/admin/members/reveal-id";
import { KtaPanel } from "@/components/admin/members/kta-panel";
import { formatDateTime, formatDay } from "@/lib/format";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("members");
  return { title: t("detailTitle") };
}

export default async function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAdmin("member:read", `/admin/members/${id}`);
  const t = await getTranslations("members");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const role = auth.user.role;

  const m = await getMember(auth, id, { revealId: false }, requestContext(await headers())).catch((e) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });
  const canIssue = can(role, "kta:issue");
  const [history, cards, previewUrl] = await Promise.all([
    memberStatusHistory(auth, id),
    listCards(auth, id),
    canIssue ? activeCardPreviewUrl(auth, id) : Promise.resolve(null),
  ]);

  const loc = m.location;
  const place = [loc.aldeia?.name, loc.suco?.name, loc.adminPost?.name, loc.municipality.name].filter(Boolean).join(", ");

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href="/admin/members" className="hover:underline">
            {t("title")}
          </Link>
        }
        title={t("detailTitle")}
        actions={
          <MemberActions
            memberId={m.id}
            status={m.status}
            fullName={m.fullName}
            canVerify={can(role, "member:verify")}
            canUpdate={can(role, "member:update")}
            canDelete={can(role, "member:delete")}
          />
        }
      />

      <Card className="mb-6">
        <CardContent className="flex flex-col items-center gap-4 pt-5 text-center sm:flex-row sm:text-left">
          <MemberAvatar name={m.fullName} url={m.photoUrl} size="lg" />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-col items-center gap-2 sm:flex-row">
              <h2 className="text-xl font-extrabold sm:text-2xl">{m.fullName}</h2>
              <MemberStatusBadge status={m.status} />
            </div>
            <p className="font-mono text-sm font-semibold text-primary">{m.memberNumber ?? t("noNumberYet")}</p>
            <p className="text-sm text-muted-foreground">
              {t("fields.registrationRef")}: <span className="font-mono">{m.registrationRef}</span> · {tc(`enums.registrationChannel.${m.channel}`)} ·{" "}
              {formatDateTime(m.createdAt, locale)}
            </p>
          </div>
        </CardContent>
      </Card>

      {m.status === "REJECTED" && m.rejectionReason && (
        <Alert variant="error" title={t("rejectionReason")} className="mb-6">
          {m.rejectionReason}
        </Alert>
      )}
      {m.status === "SUSPENDED" && m.suspensionReason && (
        <Alert variant="warning" title={t("suspensionReason")} className="mb-6">
          {m.suspensionReason}
        </Alert>
      )}

      <Tabs defaultValue="profile">
        <div className="-mx-1 overflow-x-auto px-1">
          <TabsList>
            <TabsTrigger value="profile">
              <UserRound className="size-4" aria-hidden />
              {t("tabs.profile")}
            </TabsTrigger>
            <TabsTrigger value="history">
              <History className="size-4" aria-hidden />
              {t("tabs.history")}
            </TabsTrigger>
            <TabsTrigger value="kta">
              <CreditCard className="size-4" aria-hidden />
              {t("tabs.kta")}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="profile">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t("form.identity")}</CardTitle>
              </CardHeader>
              <CardContent>
                <DetailList
                  items={[
                    { label: t("fields.fullName"), value: m.fullName },
                    { label: t("fields.gender"), value: tc(`enums.gender.${m.gender}`) },
                    { label: t("fields.birthDate"), value: `${formatDay(m.birthDate, locale)} (${t("ageYears", { age: m.age })})` },
                    { label: t("fields.birthPlace"), value: m.birthPlace },
                    { label: t("fields.idDocumentType"), value: tc(`enums.idDocumentType.${m.idDocumentType}`) },
                    {
                      label: t("fields.idNumber"),
                      value: <RevealId memberId={m.id} masked={m.idNumberMasked} hasIdScan={m.hasIdScan} canReveal={can(role, "member:reveal_id")} />,
                    },
                    { label: t("fields.occupation"), value: m.occupation },
                    { label: t("fields.educationLevel"), value: m.educationLevel ? tc(`enums.educationLevel.${m.educationLevel}`) : null },
                  ]}
                />
              </CardContent>
            </Card>
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t("form.contactAddress")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <DetailList
                    items={[
                      { label: t("fields.phone"), value: m.phone ? <a href={`tel:${m.phone}`} className="hover:underline">{m.phone}</a> : null },
                      { label: t("fields.email"), value: m.email ? <a href={`mailto:${m.email}`} className="hover:underline">{m.email}</a> : null },
                      { label: t("fields.location"), value: place },
                      { label: t("fields.addressLine"), value: m.addressLine },
                    ]}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{t("form.membership")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <DetailList
                    items={[
                      { label: t("fields.rank"), value: tc(`enums.memberRank.${m.rank}`) },
                      { label: t("fields.joinedAt"), value: m.joinedAt ? formatDay(m.joinedAt, locale) : null },
                      { label: t("fields.verifiedAt"), value: m.verifiedAt ? formatDateTime(m.verifiedAt, locale) : null },
                      { label: t("fields.verifiedBy"), value: m.verifiedBy?.name },
                    ]}
                  />
                  {m.motivation && (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("fields.motivation")}</p>
                      <p className="mt-1 whitespace-pre-line text-sm">{m.motivation}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardContent className="pt-5">
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">{tc("states.empty")}</p>
              ) : (
                <ol className="relative space-y-5 border-l pl-6">
                  {history.map((h) => (
                    <li key={h.id} className="relative">
                      <span aria-hidden className="absolute -left-[1.84rem] top-1 size-3 rounded-full border-2 border-background bg-primary" />
                      <div className="flex flex-wrap items-center gap-2">
                        {h.fromStatus && (
                          <>
                            <MemberStatusBadge status={h.fromStatus} />
                            <span aria-hidden>→</span>
                          </>
                        )}
                        <MemberStatusBadge status={h.toStatus} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDateTime(h.createdAt, locale)} · {h.changedBy?.name ?? t("history.system")}
                      </p>
                      {h.reason && <p className="mt-1 whitespace-pre-line text-sm">{h.reason}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="kta">
          <KtaPanel memberId={m.id} verified={m.status === "VERIFIED"} memberNumber={m.memberNumber} cards={cards} previewUrl={previewUrl} canIssue={canIssue} />
        </TabsContent>
      </Tabs>
    </>
  );
}
