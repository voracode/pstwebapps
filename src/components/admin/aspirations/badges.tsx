import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/primitives";

const STATUS = {
  NEW: "default",
  ACKNOWLEDGED: "info",
  IN_REVIEW: "warning",
  FORWARDED: "gold",
  RESOLVED: "success",
  CLOSED: "muted",
  SPAM: "dark",
} as const;

const PRIORITY = {
  LOW: "muted",
  NORMAL: "outline",
  HIGH: "warning",
  URGENT: "danger",
} as const;

export function TicketStatusBadge({ status }: { status: string }) {
  const t = useTranslations("common.enums.ticketStatus");
  return <Badge variant={STATUS[status as keyof typeof STATUS] ?? "muted"}>{t(status as keyof typeof STATUS)}</Badge>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  const t = useTranslations("common.enums.ticketPriority");
  return <Badge variant={PRIORITY[priority as keyof typeof PRIORITY] ?? "muted"}>{t(priority as keyof typeof PRIORITY)}</Badge>;
}
