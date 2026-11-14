"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Ban, CreditCard, FileDown, ImageDown, QrCode, RefreshCw } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { api, errorMessage } from "@/lib/api-client";
import { formatDate, formatDateTime } from "@/lib/format";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/overlays";

export interface CardRow {
  id: string;
  version: number;
  issuedAt: Date | string;
  expiresAt: Date | string | null;
  revokedAt: Date | string | null;
  issuedBy: { name: string } | null;
}

export function KtaPanel({
  memberId,
  verified,
  memberNumber,
  cards,
  previewUrl,
  canIssue,
}: {
  memberId: string;
  verified: boolean;
  memberNumber: string | null;
  cards: CardRow[];
  previewUrl: string | null;
  canIssue: boolean;
}) {
  const t = useTranslations("members.kta");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [confirm, setConfirm] = useState<null | "revoke" | "rotate_qr" | "issue">(null);
  const [busy, setBusy] = useState(false);
  const active = cards.find((c) => !c.revokedAt) ?? null;

  const run = async (action: "issue" | "revoke" | "rotate_qr") => {
    setBusy(true);
    try {
      await api.post(`/api/admin/members/${memberId}/kta`, { action });
      toast.success(t(`done.${action}`));
      setConfirm(null);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err, tc));
    } finally {
      setBusy(false);
    }
  };

  const fileUrl = (format: "pdf" | "png") => `/api/admin/members/${memberId}/kta?format=${format}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="size-5" aria-hidden />
            {t("current")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!verified && <Alert variant="info">{t("notVerified")}</Alert>}
          {active ? (
            <>
              {previewUrl && canIssue && (
                // eslint-disable-next-line @next/next/no-img-element -- signed, private card image
                <img src={previewUrl} alt={t("previewAlt", { number: memberNumber ?? "" })} className="w-full rounded-lg border bg-muted object-contain" />
              )}
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">{t("version")}</dt>
                  <dd className="font-semibold">v{active.version}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">{t("issuedAt")}</dt>
                  <dd className="font-semibold">{formatDate(active.issuedAt, locale)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">{t("expiresAt")}</dt>
                  <dd className="font-semibold">{active.expiresAt ? formatDate(active.expiresAt, locale) : "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">{t("issuedBy")}</dt>
                  <dd className="font-semibold">{active.issuedBy?.name ?? "—"}</dd>
                </div>
              </dl>
            </>
          ) : (
            verified && <EmptyState icon={CreditCard} title={t("noCard")} description={canIssue ? t("noCardHint") : undefined} />
          )}

          {canIssue && (
            <div className="flex flex-wrap gap-2">
              {verified && (
                <Button onClick={() => (active ? setConfirm("issue") : run("issue"))} loading={busy && confirm === null}>
                  <CreditCard />
                  {active ? t("reissue") : t("issue")}
                </Button>
              )}
              {active && (
                <>
                  <a href={fileUrl("pdf")} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline" })}>
                    <FileDown />
                    PDF
                  </a>
                  <a href={fileUrl("png")} download className={buttonVariants({ variant: "outline" })}>
                    <ImageDown />
                    PNG
                  </a>
                  <Button variant="outline" className="text-destructive" onClick={() => setConfirm("revoke")}>
                    <Ban />
                    {t("revoke")}
                  </Button>
                </>
              )}
              {verified && (
                <Button variant="ghost" onClick={() => setConfirm("rotate_qr")}>
                  <QrCode />
                  {t("rotateQr")}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("history")}</CardTitle>
        </CardHeader>
        <CardContent>
          {cards.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noHistory")}</p>
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>{t("version")}</TH>
                  <TH>{t("issuedAt")}</TH>
                  <TH>{t("state")}</TH>
                </tr>
              </THead>
              <TBody>
                {cards.map((c) => (
                  <TR key={c.id}>
                    <TD className="font-semibold">v{c.version}</TD>
                    <TD className="whitespace-nowrap">
                      {formatDateTime(c.issuedAt, locale)}
                      {c.issuedBy && <span className="block text-xs text-muted-foreground">{c.issuedBy.name}</span>}
                    </TD>
                    <TD>
                      {c.revokedAt ? (
                        <Badge variant="muted" title={formatDateTime(c.revokedAt, locale)}>
                          {t("revoked")}
                        </Badge>
                      ) : (
                        <Badge variant="success">{t("active")}</Badge>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm ? t(`confirm.${confirm}Title`) : ""}
        description={confirm ? t(`confirm.${confirm}Description`) : undefined}
        confirmLabel={tc("actions.confirm")}
        cancelLabel={tc("actions.cancel")}
        destructive={confirm !== "issue"}
        loading={busy}
        onConfirm={() => confirm && run(confirm)}
      >
        {confirm === "rotate_qr" && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="size-4" aria-hidden />
            {t("confirm.rotate_qrNext")}
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
