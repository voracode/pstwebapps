"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Eye, EyeOff, FileSearch } from "lucide-react";
import { api, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

/** Masked ID number with an audited "Reveal" action (`member:reveal_id`). */
export function RevealId({ memberId, masked, hasIdScan, canReveal }: { memberId: string; masked: string | null; hasIdScan: boolean; canReveal: boolean }) {
  const t = useTranslations("members");
  const tc = useTranslations("common");
  const [revealed, setRevealed] = useState<{ idNumber?: string; idScanUrl?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const reveal = async () => {
    setBusy(true);
    try {
      setRevealed(await api.get<{ idNumber?: string; idScanUrl?: string }>(`/api/admin/members/${memberId}?reveal=id`));
    } catch (err) {
      toast.error(errorMessage(err, tc));
    } finally {
      setBusy(false);
    }
  };

  if (!masked && !hasIdScan) return <span className="text-muted-foreground">—</span>;

  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="font-mono">{revealed?.idNumber ?? masked ?? "—"}</span>
      {canReveal &&
        (revealed ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setRevealed(null)}>
            <EyeOff />
            {t("profile.hide")}
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={reveal} loading={busy} title={t("profile.revealAudited")}>
            <Eye />
            {t("profile.reveal")}
          </Button>
        ))}
      {revealed?.idScanUrl && (
        <a href={revealed.idScanUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
          <FileSearch className="size-4" aria-hidden />
          {t("profile.viewIdScan")}
        </a>
      )}
    </span>
  );
}
