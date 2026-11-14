"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { CheckCircle2, FileCheck2, FileUp, RotateCcw, Upload } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { api, ApiClientError, errorMessage } from "@/lib/api-client";
import { formatNumber } from "@/lib/format";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-controls";
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { StatTile } from "@/components/admin/page-header";

interface Issue {
  row: number;
  field: string;
  message: string;
}
interface ImportResult {
  dryRun: boolean;
  totalRows: number;
  validRows: number;
  importedRows: number;
  errorRows: number;
  errors: Issue[];
  warnings: Issue[];
}

export function ImportWizard() {
  const t = useTranslations("members.import");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [inputKey, setInputKey] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [problem, setProblem] = useState<{ message: string; details?: string } | null>(null);
  const [busy, setBusy] = useState<null | "dry" | "real">(null);

  const reset = () => {
    setFile(null);
    setResult(null);
    setProblem(null);
    setInputKey((k) => k + 1);
  };

  const send = async (dryRun: boolean) => {
    if (!file) return;
    setBusy(dryRun ? "dry" : "real");
    setProblem(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("dryRun", String(dryRun));
      const res = await api.post<ImportResult>("/api/admin/members/import", fd);
      setResult(res);
      if (!dryRun) toast.success(t("importedToast", { count: res.importedRows }));
    } catch (err) {
      if (err instanceof ApiClientError) {
        const d = err.details as { missing?: string[]; expected?: string[] } | ImportResult | undefined;
        if (d && "totalRows" in d) setResult({ ...d, dryRun: true });
        const details = d && "missing" in d && d.missing ? t("missingColumns", { columns: d.missing.join(", ") }) : undefined;
        setProblem({ message: errorMessage(err, tc), details });
      } else {
        toast.error(errorMessage(err, tc));
      }
    } finally {
      setBusy(null);
    }
  };

  const done = result && !result.dryRun;
  const n = (x: number) => formatNumber(x, locale);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileUp className="size-5" aria-hidden />
            {t("step1")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("instructions")}{" "}
            <a href="/api/admin/members/import" download className="font-semibold text-primary hover:underline">
              {t("downloadTemplate")}
            </a>
          </p>
          <Field label={t("file")} htmlFor="import-file" hint={t("fileHint")}>
            <Input
              key={inputKey}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={!!busy || !!done}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setResult(null);
                setProblem(null);
              }}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => send(true)} disabled={!file || !!done} loading={busy === "dry"} variant={result ? "outline" : "default"}>
              <FileCheck2 />
              {t("validate")}
            </Button>
            {(result || file) && (
              <Button variant="ghost" onClick={reset} disabled={!!busy}>
                <RotateCcw />
                {t("startOver")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {problem && (
        <Alert variant="error" title={problem.message}>
          {problem.details}
        </Alert>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {done ? <CheckCircle2 className="size-5 text-green-600" aria-hidden /> : <FileCheck2 className="size-5" aria-hidden />}
              {done ? t("resultTitle") : t("step2")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label={t("totalRows")} value={n(result.totalRows)} />
              <StatTile label={t("validRows")} value={n(result.validRows)} tone={result.validRows ? "gold" : "default"} />
              <StatTile label={t("errorRows")} value={n(result.errorRows)} tone={result.errorRows ? "red" : "default"} />
              <StatTile label={done ? t("importedRows") : t("warnings")} value={n(done ? result.importedRows : result.warnings.length)} tone={done ? "dark" : "default"} />
            </div>

            {done ? (
              <Alert variant="success" title={t("importedToast", { count: result.importedRows })}>
                {t("importedHint")}
              </Alert>
            ) : result.validRows > 0 ? (
              <Alert variant={result.errorRows ? "warning" : "success"}>{result.errorRows ? t("partialHint", { valid: result.validRows }) : t("allValidHint")}</Alert>
            ) : (
              <Alert variant="error">{t("noneValid")}</Alert>
            )}

            <IssueTable title={t("errorsTitle")} issues={result.errors} variant="danger" />
            <IssueTable title={t("warningsTitle")} issues={result.warnings} variant="warning" />

            <div className="flex flex-wrap justify-end gap-2">
              {done ? (
                <Link href="/admin/members?status=PENDING&channel=FIELD_IMPORT" className={buttonVariants()}>
                  {t("viewImported")}
                </Link>
              ) : (
                result.validRows > 0 && (
                  <Button onClick={() => send(false)} loading={busy === "real"} disabled={!!busy}>
                    <Upload />
                    {t("confirm", { count: result.validRows })}
                  </Button>
                )
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function IssueTable({ title, issues, variant }: { title: string; issues: Issue[]; variant: "danger" | "warning" }) {
  const t = useTranslations("members.import");
  if (!issues.length) return null;
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-bold">
        {title}
        <Badge variant={variant}>{issues.length}</Badge>
      </h3>
      <div className="max-h-80 overflow-y-auto">
        <Table>
          <THead>
            <tr>
              <TH className="w-20">{t("row")}</TH>
              <TH className="w-40">{t("field")}</TH>
              <TH>{t("message")}</TH>
            </tr>
          </THead>
          <TBody>
            {issues.map((i, idx) => (
              <TR key={idx}>
                <TD className="tabular-nums">{i.row > 0 ? i.row : "—"}</TD>
                <TD className="font-mono text-xs">{i.field}</TD>
                <TD>{i.message}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </section>
  );
}
