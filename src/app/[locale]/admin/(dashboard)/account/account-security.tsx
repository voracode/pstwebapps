"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { api, errorMessage } from "@/lib/api-client";
import type { ClientUser } from "@/lib/auth/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-controls";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { ChangePassword, RecoveryCodes, SetupTwoFactor } from "../../(auth)/login/login-flow";

export function AccountSecurity({ user, recoveryCodesLeft }: { user: ClientUser; recoveryCodesLeft: number }) {
  const t = useTranslations("admin.account");
  const ta = useTranslations("auth");
  const tc = useTranslations("common");
  const router = useRouter();
  const [dialog, setDialog] = useState<null | "password" | "setup" | "regen">(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);

  const regenerate = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ recoveryCodes: string[] }>("/api/auth/2fa", { code: otp });
      setCodes(res.recoveryCodes);
      setOtp("");
    } catch (err) {
      toast.error(errorMessage(err, tc));
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setDialog(null);
    setCodes(null);
    router.refresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("security")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between gap-3 rounded-md border p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            {user.twoFactorEnabled ? <ShieldCheck className="size-5 text-green-600" /> : <ShieldOff className="size-5 text-amber-600" />}
            {user.twoFactorEnabled ? t("twoFactorOn") : t("twoFactorOff")}
          </div>
          {user.twoFactorEnabled ? (
            <Badge variant="muted">{recoveryCodesLeft}/10</Badge>
          ) : (
            <Button size="sm" onClick={() => setDialog("setup")}>
              {t("enable2fa")}
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setDialog("password")}>
            {ta("changePasswordTitle")}
          </Button>
          {user.twoFactorEnabled && (
            <Button variant="outline" onClick={() => setDialog("regen")}>
              {t("regenerateCodes")}
            </Button>
          )}
        </div>
      </CardContent>

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && close()}>
        {dialog === "password" && (
          <DialogContent title={ta("changePasswordTitle")}>
            <ChangePassword
              forced={false}
              onStage={() => {
                toast.success(ta("passwordChanged"));
                close();
              }}
            />
          </DialogContent>
        )}
        {dialog === "setup" && (
          <DialogContent title={ta("setup2faTitle")}>
            {codes ? <RecoveryCodes codes={codes} onDone={close} /> : <SetupTwoFactor onStage={() => undefined} onCodes={setCodes} />}
          </DialogContent>
        )}
        {dialog === "regen" && (
          <DialogContent title={t("regenerateCodes")} description={t("regenerateHelp")}>
            {codes ? (
              <RecoveryCodes codes={codes} onDone={close} />
            ) : (
              <div className="space-y-3">
                <Input
                  inputMode="numeric"
                  maxLength={6}
                  aria-label={ta("code")}
                  className="h-12 text-center font-mono text-xl tracking-[0.4em]"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                />
                <Button className="w-full" loading={busy} disabled={otp.length !== 6} onClick={regenerate}>
                  {tc("actions.confirm")}
                </Button>
              </div>
            )}
          </DialogContent>
        )}
      </Dialog>
    </Card>
  );
}
