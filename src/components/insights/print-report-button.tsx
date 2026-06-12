"use client";

import { Printer } from "lucide-react";

export function PrintReportButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
    >
      <Printer className="h-4 w-4" />
      <span className="hidden lg:inline">Print report</span>
    </button>
  );
}
