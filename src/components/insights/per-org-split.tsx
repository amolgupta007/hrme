"use client";
import { ORG_SERIES_COLORS } from "@/lib/insights/chart-theme";

export function PerOrgSplit({ items }: { items: { orgName: string; value: string }[] }) {
  if (items.length <= 1) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
      {items.map((it, i) => (
        <span key={it.orgName} className="flex items-center gap-1 text-[11px] text-slate-400">
          <span className="h-2 w-2 rounded-full" style={{ background: ORG_SERIES_COLORS[i % ORG_SERIES_COLORS.length] }} />
          <span className="text-slate-300">{it.orgName}</span>
          <span className="tabular-nums text-slate-100">{it.value}</span>
        </span>
      ))}
    </div>
  );
}
