import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";

// ---------------------------------------------------------------- Card
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)} {...props} />;
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 p-5 pb-3", className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-lg font-bold leading-tight", className)} {...props} />;
}
export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}
export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center gap-2 border-t p-4", className)} {...props} />;
}

// ---------------------------------------------------------------- Badge
export const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", {
  variants: {
    variant: {
      default: "bg-pst-red text-white",
      gold: "bg-pst-gold text-pst-ink",
      outline: "border text-foreground",
      muted: "bg-muted text-muted-foreground",
      success: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
      warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
      danger: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
      info: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
      dark: "bg-pst-ink text-white",
    },
  },
  defaultVariants: { variant: "default" },
});
export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

// ---------------------------------------------------------------- Alert
const alertIcons = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: XCircle };
const alertStyles = {
  info: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200",
  success: "border-green-200 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-200",
  warning: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  error: "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
};
export function Alert({
  variant = "info",
  title,
  children,
  className,
}: {
  variant?: keyof typeof alertStyles;
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const Icon = alertIcons[variant];
  return (
    <div role={variant === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-md border p-3 text-sm", alertStyles[variant], className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Misc
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn("inline-flex items-center gap-2 text-sm text-muted-foreground", className)}>
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label ?? <span className="sr-only">Loading</span>}
    </span>
  );
}

export function Separator({ className }: { className?: string }) {
  return <hr className={cn("border-border", className)} />;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-10 text-center", className)}>
      {Icon && <Icon className="size-10 text-muted-foreground/60" />}
      <p className="font-semibold">{title}</p>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Table
export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto rounded-lg border bg-card">
      <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}
export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground", className)} {...props} />;
}
export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y", className)} {...props} />;
}
export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition-colors hover:bg-muted/40", className)} {...props} />;
}
export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("h-10 px-3 font-semibold whitespace-nowrap", className)} {...props} />;
}
export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-3 py-2.5 align-middle", className)} {...props} />;
}

// ---------------------------------------------------------------- Section heading (public site)
export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  className,
  invert,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  align?: "left" | "center";
  className?: string;
  invert?: boolean;
}) {
  return (
    <div className={cn("space-y-2", align === "center" && "mx-auto max-w-2xl text-center", className)}>
      {eyebrow && (
        <p className={cn("text-xs font-bold uppercase tracking-[0.2em]", invert ? "text-pst-gold" : "text-pst-red")}>
          <span aria-hidden>★ </span>
          {eyebrow}
        </p>
      )}
      <h2 className={cn("text-3xl font-extrabold uppercase sm:text-4xl", invert && "text-white")}>{title}</h2>
      {description && <p className={cn("text-base", invert ? "text-white/80" : "text-muted-foreground")}>{description}</p>}
    </div>
  );
}
