"use client";

import { useTranslations } from "next-intl";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/overlays";

/** Export with the current filters (`query` = list query string without page). */
export function ExportMenu({ query, total }: { query: string; total: number }) {
  const t = useTranslations("members");
  const tc = useTranslations("common");
  const href = (format: "xlsx" | "csv") => `/api/admin/members/export?${new URLSearchParams([...new URLSearchParams(query), ["format", format]]).toString()}`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={total === 0}>
          <Download />
          {tc("actions.export")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>{t("export.hint", { count: total })}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={href("xlsx")} download>
            <FileSpreadsheet />
            {t("export.xlsx")}
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={href("csv")} download>
            <FileText />
            {t("export.csv")}
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
