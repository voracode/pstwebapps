import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/primitives";

const VARIANT = {
  DRAFT: "muted",
  SCHEDULED: "info",
  ONGOING: "success",
  COMPLETED: "dark",
  POSTPONED: "warning",
  CANCELLED: "danger",
} as const;

export function EventStatusBadge({ status }: { status: string }) {
  const t = useTranslations("common.enums.eventStatus");
  return <Badge variant={VARIANT[status as keyof typeof VARIANT] ?? "muted"}>{t(status as keyof typeof VARIANT)}</Badge>;
}
