import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Search, SlidersHorizontal } from "lucide-react";
import { Pagination, pageHref } from "@/components/ui/pagination";
import { Input, Label, NativeSelect } from "@/components/ui/form-controls";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

/** Link pagination that keeps the locale prefix and current filters. */
export async function ListPagination({
  basePath,
  params,
  page,
  total,
  pageSize,
}: {
  basePath: string;
  params: Record<string, string | string[] | undefined>;
  page: number;
  total: number;
  pageSize: number;
}) {
  const t = await getTranslations("common");
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return (
    <Pagination
      className="mt-10"
      page={Math.min(page, pageCount)}
      pageCount={pageCount}
      hrefFor={(p) => pageHref(basePath, params, p)}
      labels={{
        previous: t("actions.previous"),
        next: t("actions.next"),
        page: (p, total) => t("pagination.page", { page: p, total }),
      }}
    />
  );
}

export interface SelectFilter {
  name: string;
  label: string;
  value?: string;
  options: { value: string; label: string }[];
}

/**
 * Plain GET form: works without JavaScript and keeps URLs shareable.
 * `action` must include the locale prefix.
 */
export async function FilterForm({
  action,
  selects,
  search,
  hasActive,
  className,
}: {
  action: string;
  selects: SelectFilter[];
  search?: { name: string; label: string; placeholder: string; value?: string };
  hasActive: boolean;
  className?: string;
}) {
  const t = await getTranslations("public.common");
  return (
    <form action={action} method="get" role="search" className={cn("rounded-lg border bg-surface p-4", className)}>
      <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <SlidersHorizontal className="size-4" aria-hidden />
        {t("filters")}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] lg:items-end">
        {search && (
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
            <Label htmlFor={`f-${search.name}`}>{search.label}</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input id={`f-${search.name}`} name={search.name} type="search" defaultValue={search.value} placeholder={search.placeholder} maxLength={100} className="pl-9" />
            </div>
          </div>
        )}
        {selects.map((s) => (
          <div key={s.name} className="space-y-1.5">
            <Label htmlFor={`f-${s.name}`}>{s.label}</Label>
            <NativeSelect id={`f-${s.name}`} name={s.name} defaultValue={s.value ?? ""}>
              <option value="">{t("all")}</option>
              {s.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </div>
        ))}
        <div className="flex gap-2">
          <button type="submit" className={cn(buttonVariants(), "flex-1")}>
            {t("apply")}
          </button>
          {hasActive && (
            <a href={action} className={buttonVariants({ variant: "outline" })}>
              {t("reset")}
            </a>
          )}
        </div>
      </div>
    </form>
  );
}

export function ResultCount({ children }: { children: ReactNode }) {
  return (
    <p className="mb-4 text-sm text-muted-foreground" aria-live="polite">
      {children}
    </p>
  );
}
