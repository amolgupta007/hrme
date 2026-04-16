"use client";

import * as React from "react";
import Papa from "papaparse";
import { useRouter } from "next/navigation";
import { Upload, FileText, Download, CheckCircle2, XCircle, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { bulkImportEmployees } from "@/actions/employees";
import type { ImportRow, ImportResult } from "@/actions/employees";
import type { Department } from "@/types";

interface ImportClientProps {
  departments: Department[];
  plan: string;
}

type Stage = "upload" | "preview" | "results";

type ParsedRow = ImportRow & { _rowNum: number; _valid: boolean; _error?: string };

const COLUMN_REFERENCE = [
  { col: "first_name *", accepts: "Text" },
  { col: "last_name *", accepts: "Text" },
  { col: "email *", accepts: "Valid email address" },
  { col: "role *", accepts: "admin | manager | employee" },
  { col: "employment_type *", accepts: "full_time | part_time | contract | intern" },
  { col: "date_of_joining *", accepts: "YYYY-MM-DD" },
  { col: "phone", accepts: "Optional — digits only" },
  { col: "department", accepts: "Optional — must match existing department name" },
  { col: "designation", accepts: "Optional — free text job title" },
  { col: "date_of_birth", accepts: "Optional — YYYY-MM-DD" },
  { col: "reporting_manager_email", accepts: "Optional — must match existing employee email" },
];

function validateRow(row: any, rowNum: number): ParsedRow {
  const base = { ...row, _rowNum: rowNum };

  if (!row.first_name?.trim()) return { ...base, _valid: false, _error: "Missing first_name" };
  if (!row.last_name?.trim()) return { ...base, _valid: false, _error: "Missing last_name" };
  if (!row.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email))
    return { ...base, _valid: false, _error: "Missing or invalid email" };
  if (!["admin", "manager", "employee"].includes(row.role))
    return { ...base, _valid: false, _error: `Invalid role "${row.role}"` };
  if (!["full_time", "part_time", "contract", "intern"].includes(row.employment_type))
    return { ...base, _valid: false, _error: `Invalid employment_type "${row.employment_type}"` };
  if (!row.date_of_joining || !/^\d{4}-\d{2}-\d{2}$/.test(row.date_of_joining))
    return { ...base, _valid: false, _error: "Invalid date_of_joining (use YYYY-MM-DD)" };

  return { ...base, _valid: true };
}

export function ImportClient({ plan }: ImportClientProps) {
  const router = useRouter();
  const [stage, setStage] = React.useState<Stage>("upload");
  const [dragging, setDragging] = React.useState(false);
  const [parsedRows, setParsedRows] = React.useState<ParsedRow[]>([]);
  const [importing, setImporting] = React.useState(false);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const validRows = parsedRows.filter((r) => r._valid);
  const skippedRows = parsedRows.filter((r) => !r._valid);

  function handleFile(file: File) {
    if (!file.name.endsWith(".csv")) {
      toast.error("Please upload a .csv file");
      return;
    }
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = (results.data as any[]).map((row, i) => validateRow(row, i + 1));
        setParsedRows(rows);
        setStage("preview");
      },
      error: () => toast.error("Failed to parse CSV. Make sure it is a valid file."),
    });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  async function handleImport() {
    const rows: ImportRow[] = validRows.map(({ _rowNum, _valid, _error, ...rest }) => rest as ImportRow);
    setImporting(true);
    try {
      const res = await bulkImportEmployees(rows);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setResult(res.data);
      setStage("results");
    } finally {
      setImporting(false);
    }
  }

  function downloadErrors() {
    if (!result) return;
    const errorRows = result.errors.map((e) => ({
      ...e.data,
      error_reason: e.reason,
    }));
    const csv = Papa.unparse(errorRows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "import-errors.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---- Stage: Upload ----
  if (stage === "upload") {
    return (
      <div className="space-y-6 max-w-3xl">
        <div
          className={cn(
            "rounded-xl border-2 border-dashed p-12 text-center transition-colors cursor-pointer",
            dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
          )}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
          <p className="font-medium">Drag and drop your CSV here</p>
          <p className="text-sm text-muted-foreground mt-1">or click to browse — .csv files only</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>

        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
          <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Need the template?</p>
            <p className="text-xs text-muted-foreground">Download the CSV template with correct headers and an example row.</p>
          </div>
          <a href="/employee-import-template.csv" download className="shrink-0">
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-3.5 w-3.5" />
              Template
            </Button>
          </a>
        </div>

        <div className="rounded-xl border border-border overflow-hidden">
          <div className="bg-muted/60 px-4 py-2.5 text-sm font-medium">Column Reference</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Column</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Accepts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {COLUMN_REFERENCE.map((c) => (
                <tr key={c.col} className="hover:bg-muted/20">
                  <td className="px-4 py-2 font-mono text-xs">{c.col}</td>
                  <td className="px-4 py-2 text-muted-foreground">{c.accepts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ---- Stage: Preview ----
  if (stage === "preview") {
    return (
      <div className="space-y-4 max-w-5xl">
        <div className="flex items-center gap-4 rounded-lg border border-border bg-muted/30 px-4 py-3">
          <span className="flex items-center gap-1.5 text-sm font-medium text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            {validRows.length} valid
          </span>
          {skippedRows.length > 0 && (
            <span className="flex items-center gap-1.5 text-sm font-medium text-destructive">
              <XCircle className="h-4 w-4" />
              {skippedRows.length} skipped
            </span>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setParsedRows([]); setStage("upload"); }}>
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Re-upload
            </Button>
            <Button size="sm" onClick={handleImport} disabled={importing || validRows.length === 0}>
              {importing ? "Importing…" : `Import ${validRows.length} employees`}
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-border overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-border bg-muted/60">
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground w-12">#</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Email</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Role</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Type</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Joining</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {parsedRows.map((row) => (
                <tr key={row._rowNum} className={cn("transition-colors", row._valid ? "hover:bg-muted/20" : "bg-destructive/5 opacity-60")}>
                  <td className="px-3 py-2 text-muted-foreground">{row._rowNum}</td>
                  <td className="px-3 py-2 font-medium">{row.first_name} {row.last_name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{row.email}</td>
                  <td className="px-3 py-2 text-muted-foreground">{row.role}</td>
                  <td className="px-3 py-2 text-muted-foreground">{row.employment_type}</td>
                  <td className="px-3 py-2 text-muted-foreground">{row.date_of_joining}</td>
                  <td className="px-3 py-2">
                    {row._valid ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Valid
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive" title={row._error}>
                        <XCircle className="h-3.5 w-3.5" /> {row._error}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ---- Stage: Results ----
  return (
    <div className="space-y-6 max-w-2xl">
      <div className="rounded-xl border border-border bg-muted/20 p-6 text-center space-y-3">
        <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
        <h2 className="text-xl font-semibold">Import complete</h2>
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">{result?.imported ?? 0} employees</span> imported successfully.
          {(result?.skipped ?? 0) > 0 && (
            <> <span className="font-medium text-destructive">{result!.skipped} skipped</span> due to errors.</>
          )}
        </p>
        <div className="flex justify-center gap-3 pt-2">
          {(result?.skipped ?? 0) > 0 && (
            <Button variant="outline" onClick={downloadErrors}>
              <Download className="mr-2 h-4 w-4" />
              Download errors.csv
            </Button>
          )}
          <Button onClick={() => router.push("/dashboard/employees")}>
            Go to Employees
          </Button>
        </div>
      </div>

      {(result?.skipped ?? 0) > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="bg-muted/60 px-4 py-2.5 text-sm font-medium">Skipped rows</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left font-medium text-muted-foreground w-12">Row</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Email</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {result!.errors.map((e) => (
                <tr key={e.row} className="hover:bg-muted/20">
                  <td className="px-4 py-2 text-muted-foreground">{e.row}</td>
                  <td className="px-4 py-2">{e.data.email || "—"}</td>
                  <td className="px-4 py-2 text-destructive">{e.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
