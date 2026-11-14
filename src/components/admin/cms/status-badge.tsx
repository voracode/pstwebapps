import { Badge } from "@/components/ui/primitives";

export type PublishStatusValue = "DRAFT" | "IN_REVIEW" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED";

const VARIANT = {
  DRAFT: "muted",
  IN_REVIEW: "warning",
  SCHEDULED: "info",
  PUBLISHED: "success",
  ARCHIVED: "outline",
} as const;

/** Coloured badge for a PublishStatus; pass the translated label. */
export function PublishStatusBadge({ status, label }: { status: PublishStatusValue; label: string }) {
  return <Badge variant={VARIANT[status]}>{label}</Badge>;
}
