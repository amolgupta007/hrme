"use client";

import type { ConfigImpactRow } from "@/actions/payroll";
import { formatINR } from "@/lib/ctc";

export function ConfigImpactPreview({ rows }: { rows: ConfigImpactRow[] }) {
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">No salary structures to preview yet.</p>;
  }

  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <p className="text-xs font-semibold mb-2">Impact preview (per employee, monthly)</p>
      <div className="max-h-64 overflow-auto">
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left font-medium pb-1.5">Employee</th>
              <th className="text-right font-medium pb-1.5">Basic Δ</th>
              <th className="text-right font-medium pb-1.5">HRA Δ</th>
              <th className="text-right font-medium pb-1.5">SA Δ</th>
              <th className="text-right font-medium pb-1.5">Net Δ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const dB = r.basic_monthly_new - r.basic_monthly_old;
              const dH = r.hra_monthly_new - r.hra_monthly_old;
              const dS = r.special_allowance_monthly_new - r.special_allowance_monthly_old;
              const dN = r.net_monthly_new - r.net_monthly_old;
              const arrow = (n: number) => (n > 0 ? "↑" : n < 0 ? "↓" : "·");
              const tone = (n: number) =>
                n > 0 ? "text-emerald-600" : n < 0 ? "text-amber-700" : "text-muted-foreground";
              return (
                <tr key={r.employee_id} className="border-t border-border/70">
                  <td className="py-1.5">{r.employee_name}</td>
                  <td className={`text-right py-1.5 ${tone(dB)}`}>
                    {arrow(dB)} {formatINR(Math.abs(dB))}
                  </td>
                  <td className={`text-right py-1.5 ${tone(dH)}`}>
                    {arrow(dH)} {formatINR(Math.abs(dH))}
                  </td>
                  <td className={`text-right py-1.5 ${tone(dS)}`}>
                    {arrow(dS)} {formatINR(Math.abs(dS))}
                  </td>
                  <td className={`text-right py-1.5 ${tone(dN)}`}>
                    {arrow(dN)} {formatINR(Math.abs(dN))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
