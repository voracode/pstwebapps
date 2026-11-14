import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/** Standard top-of-page header for backoffice screens. */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 space-y-1">
        {breadcrumb && <div className="text-xs text-muted-foreground">{breadcrumb}</div>}
        <h1 className="truncate text-2xl font-extrabold uppercase tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Responsive grid of label/value pairs for detail screens. */
export function DetailList({ items, className }: { items: { label: ReactNode; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-4 sm:grid-cols-2", className)}>
      {items.map((it, i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{it.label}</dt>
          <dd className="mt-0.5 break-words text-sm font-medium">{it.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Small KPI tile for dashboards. */
export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: "default" | "red" | "gold" | "dark";
}) {
  const tones = {
    default: "bg-card",
    red: "bg-pst-red text-white",
    gold: "bg-pst-gold text-pst-ink",
    dark: "bg-pst-ink text-white",
  };
  return (
    <div className={cn("rounded-lg border p-4 shadow-sm", tones[tone])}>
      <div className="flex items-start justify-between gap-2">
        <p className={cn("text-xs font-semibold uppercase tracking-wide", tone === "default" ? "text-muted-foreground" : "opacity-80")}>{label}</p>
        {Icon && <Icon className="size-5 opacity-70" />}
      </div>
      <p className="mt-2 font-display text-3xl font-extrabold leading-none">{value}</p>
      {hint && <p className={cn("mt-1 text-xs", tone === "default" ? "text-muted-foreground" : "opacity-80")}>{hint}</p>}
    </div>
  );
}
