"use client";

import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sparkline } from "./charts";
import type { MonthPoint } from "@/actions/insights";

export interface KpiCardProps {
  label: string;
  value: string;
  /** Small line under the value, e.g. "+3 in 30 days" or "May 2026". */
  sub?: string;
  /**
   * Delta direction for the chip. `goodWhenUp=false` inverts the colour
   * semantics (rising attrition is bad, rising headcount is good).
   */
  delta?: { value: string; direction: "up" | "down" | "flat"; goodWhenUp?: boolean };
  spark?: MonthPoint[];
  sparkColor?: string;
}

export function KpiCard({ label, value, sub, delta, spark, sparkColor }: KpiCardProps) {
  const goodWhenUp = delta?.goodWhenUp ?? true;
  const isGood =
    delta?.direction === "flat" ? null : (delta?.direction === "up") === goodWhenUp;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-white/[0.04] p-5 ring-1 ring-white/10 transition-colors hover:ring-white/20">
      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-3xl font-bold tabular-nums tracking-tight text-slate-50 lg:text-4xl">
          {value}
        </p>
        {delta && delta.direction !== "flat" && (
          <span
            className={cn(
              "flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
              isGood
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-rose-500/15 text-rose-300"
            )}
          >
            {delta.direction === "up" ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {delta.value}
          </span>
        )}
      </div>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
      {spark && spark.length > 0 && (
        <div className="mt-3 -mx-1">
          <Sparkline data={spark} color={sparkColor} />
        </div>
      )}
    </div>
  );
}
