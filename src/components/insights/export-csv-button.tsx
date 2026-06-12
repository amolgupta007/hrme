"use client";

import { Download } from "lucide-react";

// Client-only: uses Blob + createObjectURL (same constraint as downloadICS,
// CLAUDE.md gotcha #23).
export function ExportCsvButton({
  rows,
  filename,
}: {
  rows: Record<string, unknown>[];
  filename: string;
}) {
  function handleExport() {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
      headers.join(","),
      ...rows.map((r) => headers.map((h) => esc(r[h])).join(",")),
    ].join("\n");
    // BOM so Excel reads ₹ and other non-ASCII correctly
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={rows.length === 0}
      title="Download CSV"
      aria-label="Download CSV"
      className="print-hide rounded-md p-1.5 text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-200 disabled:opacity-40"
    >
      <Download className="h-3.5 w-3.5" />
    </button>
  );
}
