"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronDown, Mail, MailOpen, Phone, ShieldAlert, ShieldCheck } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { api, errorMessage } from "@/lib/api-client";
import { formatDateTime, formatRelative } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils/cn";

export interface ContactMessageRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  subject: string | null;
  message: string;
  locale: string;
  readAt: Date | string | null;
  isSpam: boolean;
  createdAt: Date | string;
  readBy: { name: string } | null;
}

export function MessageList({ items }: { items: ContactMessageRow[] }) {
  const t = useTranslations("aspirations.contact");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Optimistic read state so the row updates before the refresh lands.
  const [readState, setReadState] = useState<Record<string, boolean>>({});

  const patch = async (id: string, body: { read?: boolean; spam?: boolean }, quiet = false) => {
    setBusy(id);
    if (body.read !== undefined) setReadState((s) => ({ ...s, [id]: body.read! }));
    try {
      await api.patch(`/api/admin/messages/${id}`, body);
      if (!quiet) toast.success(body.spam === true ? t("markedSpam") : body.spam === false ? t("markedNotSpam") : tc("states.saved"));
      router.refresh();
    } catch (err) {
      if (body.read !== undefined) setReadState((s) => ({ ...s, [id]: !body.read }));
      toast.error(errorMessage(err, tc));
    } finally {
      setBusy(null);
    }
  };

  const toggle = (m: ContactMessageRow, isRead: boolean) => {
    const next = open === m.id ? null : m.id;
    setOpen(next);
    if (next && !isRead && !m.isSpam) void patch(m.id, { read: true }, true);
  };

  return (
    <ul className="divide-y overflow-hidden rounded-lg border bg-card">
      {items.map((m) => {
        const isRead = readState[m.id] ?? !!m.readAt;
        const expanded = open === m.id;
        return (
          <li key={m.id} className={cn(!isRead && "bg-accent/40")}>
            <button
              type="button"
              onClick={() => toggle(m, isRead)}
              aria-expanded={expanded}
              aria-controls={`msg-${m.id}`}
              className="flex w-full cursor-pointer items-start gap-3 p-3 text-left hover:bg-muted/50 sm:p-4"
            >
              <span className="mt-1 shrink-0">{isRead ? <MailOpen className="size-4 text-muted-foreground" aria-hidden /> : <Mail className="size-4 text-primary" aria-hidden />}</span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2">
                  <span className={cn("truncate", !isRead ? "font-bold" : "font-medium")}>{m.name}</span>
                  {!isRead && <span className="sr-only">{t("unread")}</span>}
                  <span className="text-xs text-muted-foreground">{formatRelative(m.createdAt, locale)}</span>
                </span>
                <span className={cn("block truncate text-sm", !isRead && "font-semibold")}>{m.subject || t("noSubject")}</span>
                {!expanded && <span className="block truncate text-sm text-muted-foreground">{m.message}</span>}
              </span>
              <ChevronDown className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} aria-hidden />
            </button>
            {expanded && (
              <div id={`msg-${m.id}`} className="space-y-4 px-3 pb-4 sm:px-4 sm:pl-11">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {m.email && (
                    <a href={`mailto:${m.email}${m.subject ? `?subject=${encodeURIComponent(`Re: ${m.subject}`)}` : ""}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                      <Mail className="size-3.5" aria-hidden />
                      {m.email}
                    </a>
                  )}
                  {m.phone && (
                    <a href={`tel:${m.phone}`} className="inline-flex items-center gap-1 hover:underline">
                      <Phone className="size-3.5" aria-hidden />
                      {m.phone}
                    </a>
                  )}
                  <Badge variant="muted">{tc(`langName.${m.locale.toLowerCase() as "tet"}`)}</Badge>
                  <span className="text-xs text-muted-foreground">{formatDateTime(m.createdAt, locale)}</span>
                </div>
                <p className="whitespace-pre-line break-words rounded-md bg-muted/50 p-3 text-sm leading-relaxed">{m.message}</p>
                {m.readBy && isRead && <p className="text-xs text-muted-foreground">{t("readBy", { name: m.readBy.name })}</p>}
                <div className="flex flex-wrap gap-2">
                  {!m.isSpam && (
                    <Button size="sm" variant="outline" disabled={busy === m.id} onClick={() => patch(m.id, { read: !isRead })}>
                      {isRead ? <Mail /> : <MailOpen />}
                      {isRead ? t("markUnread") : t("markRead")}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" disabled={busy === m.id} onClick={() => patch(m.id, { spam: !m.isSpam })} className={m.isSpam ? undefined : "text-destructive"}>
                    {m.isSpam ? <ShieldCheck /> : <ShieldAlert />}
                    {m.isSpam ? t("notSpam") : t("markSpam")}
                  </Button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
