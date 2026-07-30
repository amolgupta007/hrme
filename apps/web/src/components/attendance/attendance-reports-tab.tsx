"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, FileText, Loader2 } from "lucide-react";
import { getAttendanceReportData, listReportDepartments } from "@/actions/attendance-reports";
import { csvRows, formatHours, type AttendanceReportData } from "@/lib/reports/attendance-report";

const MAX_RANGE_MSG = "Range too large — maximum 92 days";

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
// Presets must follow the org's IST calendar, not the browser's UTC date —
// between 00:00 and 05:29 IST the UTC month/day is still "yesterday", which
// would make "This month" point at the wrong month on the 1st.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
function istNow(): Date {
  return new Date(Date.now() + IST_OFFSET_MS);
}
function monthBounds(offset: number): { from: string; to: string } {
  const now = istNow();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 0));
  return { from: iso(first), to: iso(last) };
}

const PRESETS = [
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "last_7", label: "Last 7 days" },
  { key: "custom", label: "Custom" },
] as const;

export function AttendanceReportsTab() {
  const [preset, setPreset] = useState<(typeof PRESETS)[number]["key"]>("this_month");
  const [custom, setCustom] = useState(() => monthBounds(0));
  const [departmentId, setDepartmentId] = useState<string>("");
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<AttendanceReportData | null>(null);

  useEffect(() => {
    listReportDepartments().then((r) => {
      if (r.success) setDepartments(r.data);
    });
  }, []);

  const range = useMemo(() => {
    if (preset === "this_month") return monthBounds(0);
    if (preset === "last_month") return monthBounds(-1);
    if (preset === "last_7") {
      const now = istNow();
      const from = new Date(now.getTime() - 6 * 86_400_000);
      return { from: iso(from), to: iso(now) };
    }
    return custom;
  }, [preset, custom]);

  const rangeDays = useMemo(() => {
    const ms = new Date(`${range.to}T00:00:00Z`).getTime() - new Date(`${range.from}T00:00:00Z`).getTime();
    return Math.round(ms / 86_400_000) + 1;
  }, [range]);
  const rangeError =
    !/^\d{4}-\d{2}-\d{2}$/.test(range.from) || !/^\d{4}-\d{2}-\d{2}$/.test(range.to) || range.from > range.to
      ? "Invalid date range"
      : rangeDays > 92
        ? MAX_RANGE_MSG
        : null;

  async function generatePreview() {
    if (rangeError) return toast.error(rangeError);
    setLoading(true);
    const res = await getAttendanceReportData({ from: range.from, to: range.to, departmentId: departmentId || null });
    setLoading(false);
    if (!res.success) return toast.error(res.error);
    setReport(res.data);
    if (res.data.employees.length === 0) toast.info("No employees in this selection");
  }

  function downloadCsv() {
    if (!report) return;
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const text = csvRows(report).map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `attendance-${report.from}-${report.to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const pdfHref = `/api/reports/attendance/pdf?from=${range.from}&to=${range.to}${departmentId ? `&departmentId=${departmentId}` : ""}`;
  const previewMatchesRange = report && report.from === range.from && report.to === range.to;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => { setPreset(p.key); setReport(null); }}
              className={`rounded-full px-3 py-1.5 text-sm ${
                preset === p.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex items-center gap-2 text-sm">
            <input type="date" value={custom.from} max={custom.to}
              onChange={(e) => { setCustom((c) => ({ ...c, from: e.target.value })); setReport(null); }}
              className="rounded-md border px-2 py-1.5" />
            <span className="text-muted-foreground">to</span>
            <input type="date" value={custom.to} min={custom.from}
              onChange={(e) => { setCustom((c) => ({ ...c, to: e.target.value })); setReport(null); }}
              className="rounded-md border px-2 py-1.5" />
          </div>
        )}
        <select value={departmentId}
          onChange={(e) => { setDepartmentId(e.target.value); setReport(null); }}
          className="rounded-md border px-2 py-1.5 text-sm">
          <option value="">All departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <button onClick={generatePreview} disabled={loading || !!rangeError}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          Generate preview
        </button>
      </div>
      {rangeError && <p className="text-sm text-destructive">{rangeError}</p>}

      {report && (
        <>
          <div className="flex gap-2">
            <a href={pdfHref}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
              <Download className="h-4 w-4" /> Download PDF
            </a>
            <button onClick={downloadCsv}
              className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium">
              <Download className="h-4 w-4" /> Download CSV
            </button>
            {!previewMatchesRange && (
              <span className="self-center text-xs text-muted-foreground">Preview is for {report.from} – {report.to}; regenerate after changing the range.</span>
            )}
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">Department</th>
                  <th className="px-3 py-2 text-right">Days present</th>
                  <th className="px-3 py-2 text-right">Total hours</th>
                </tr>
              </thead>
              <tbody>
                {report.employees.map((e) => (
                  <tr key={e.id} className="border-t">
                    <td className="px-3 py-2">{e.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{e.department ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{e.daysPresent}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatHours(e.totalMinutes)}</td>
                  </tr>
                ))}
                {report.employees.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">No employees in this selection</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
      {!report && !loading && (
        <p className="text-sm text-muted-foreground">Pick a period and generate a preview, then download the full PDF (matrix + per-employee punch detail) or CSV.</p>
      )}
    </div>
  );
}
