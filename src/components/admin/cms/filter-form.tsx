import type { ReactNode } from "react";
import { Filter, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

/**
 * GET filter bar: filters live in the URL, so lists are shareable and work
 * without JavaScript. `action` is the localized path (e.g. "/tet/admin/posts").
 */
export function FilterForm({
  action,
  children,
  submitLabel,
  clearLabel,
  showClear,
  className,
}: {
  action: string;
  children: ReactNode;
  submitLabel: string;
  clearLabel: string;
  showClear?: boolean;
  className?: string;
}) {
  return (
    <form method="get" action={action} className={cn("mb-4 rounded-lg border bg-card p-3", className)}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">{children}</div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {showClear && (
          <a href={action} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <X aria-hidden />
            {clearLabel}
          </a>
        )}
        <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <Filter aria-hidden />
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

/** Reads a single string from Next's searchParams record. */
export function sp(params: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = params[key];
  const s = Array.isArray(v) ? v[0] : v;
  return s ? s : undefined;
}

/** Narrows a query value to one of the allowed enum values. */
export function oneOf<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

export function pageNumber(value: string | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 10_000) : 1;
}
