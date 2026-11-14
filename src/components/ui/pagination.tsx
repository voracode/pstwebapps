import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Link-based pagination (works without JS, good for slow connections).
 * `hrefFor(page)` builds the URL for a page, preserving other query params.
 */
export function Pagination({
  page,
  pageCount,
  hrefFor,
  labels,
  className,
}: {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
  labels: { previous: string; next: string; page: (p: number, total: number) => string };
  className?: string;
}) {
  if (pageCount <= 1) return null;
  const btn = "inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm font-medium hover:bg-muted";
  const disabled = "pointer-events-none opacity-40";
  return (
    <nav aria-label="Pagination" className={cn("flex items-center justify-between gap-3", className)}>
      <a href={page > 1 ? hrefFor(page - 1) : undefined} aria-disabled={page <= 1} className={cn(btn, page <= 1 && disabled)} rel="prev">
        <ChevronLeft className="size-4" aria-hidden />
        {labels.previous}
      </a>
      <span className="text-sm text-muted-foreground">{labels.page(page, pageCount)}</span>
      <a
        href={page < pageCount ? hrefFor(page + 1) : undefined}
        aria-disabled={page >= pageCount}
        className={cn(btn, page >= pageCount && disabled)}
        rel="next"
      >
        {labels.next}
        <ChevronRight className="size-4" aria-hidden />
      </a>
    </nav>
  );
}

/** Builds `?a=1&page=n` from current search params. */
export function pageHref(basePath: string, params: Record<string, string | string[] | undefined>, page: number) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k === "page" || v === undefined || v === "") continue;
    sp.set(k, Array.isArray(v) ? v[0]! : v);
  }
  if (page > 1) sp.set("page", String(page));
  const q = sp.toString();
  return q ? `${basePath}?${q}` : basePath;
}
