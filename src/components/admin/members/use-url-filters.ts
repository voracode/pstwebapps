"use client";

import { useCallback, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";

/**
 * URL-driven filters: `apply({ status: "PENDING" })` merges into the current
 * query (empty values remove the key) and always resets pagination.
 */
export function useUrlFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const apply = useCallback(
    (patch: Record<string, string | number | boolean | undefined | null>, opts: { replaceAll?: boolean } = {}) => {
      const sp = new URLSearchParams(opts.replaceAll ? "" : searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === null || v === "" || v === false) sp.delete(k);
        else sp.set(k, String(v));
      }
      sp.delete("page");
      const q = sp.toString();
      startTransition(() => router.push(q ? `${pathname}?${q}` : pathname, { scroll: false }));
    },
    [router, pathname, searchParams],
  );

  const get = useCallback((key: string) => searchParams.get(key) ?? "", [searchParams]);

  return { apply, get, pending, query: searchParams.toString() };
}
