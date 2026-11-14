import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils/cn";

const STATUS_VARIANT = {
  PENDING: "warning",
  VERIFIED: "success",
  REJECTED: "danger",
  SUSPENDED: "dark",
} as const;

export function MemberStatusBadge({ status, className }: { status: string; className?: string }) {
  const t = useTranslations("common.enums.memberStatus");
  const variant = STATUS_VARIANT[status as keyof typeof STATUS_VARIANT] ?? "muted";
  return (
    <Badge variant={variant} className={className}>
      {t(status as keyof typeof STATUS_VARIANT)}
    </Badge>
  );
}

/** Round avatar from a signed photo URL, or initials. */
export function MemberAvatar({ name, url, size = "md", className }: { name: string; url: string | null; size?: "sm" | "md" | "lg"; className?: string }) {
  const sizes = { sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-24 text-2xl sm:size-28" };
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not optimisable
    return <img src={url} alt="" className={cn("shrink-0 rounded-full border object-cover", sizes[size], className)} loading="lazy" />;
  }
  return (
    <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-bold text-muted-foreground", sizes[size], className)}>
      {initials || "?"}
    </span>
  );
}
