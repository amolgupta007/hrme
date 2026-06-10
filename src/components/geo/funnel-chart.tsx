"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { stageLabel } from "@/lib/geo/stages";
import type { LeadStage } from "@/lib/geo/stages";
import { resolveAllStageColors } from "@/lib/geo/stage-colors";

interface FunnelChartProps {
  data: { stage: LeadStage; count: number }[];
}

/**
 * Funnel by stage. Bar fills resolve at mount from the design tokens
 * (--success / --destructive / --warning / --primary / --muted-foreground)
 * so the chart speaks the same color vocabulary as the stage chips on
 * the rest of the module — one green for Converted, one amber for
 * Negotiation, one red for Lost. A MutationObserver on the <html> class
 * keeps colors tracking if the user toggles dark mode.
 *
 * Pre-mount the bars render with transparent fill (resolveAllStageColors
 * returns "transparent" when window is undefined), so the SSR pass is a
 * one-frame empty bar; useEffect populates immediately on hydration.
 * Acceptable since the page wrapper paints first and the chart is a
 * secondary surface, not the page hero.
 */
export function FunnelChart({ data }: FunnelChartProps) {
  const [colors, setColors] = useState<Record<LeadStage, string> | null>(null);

  useEffect(() => {
    const resolve = () => setColors(resolveAllStageColors());
    resolve();
    const observer = new MutationObserver(resolve);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  const total = data.reduce((s, d) => s + d.count, 0);

  if (total === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No leads to chart yet.
      </p>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    label: stageLabel(d.stage),
  }));

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData}>
          <XAxis dataKey="label" fontSize={12} />
          <YAxis allowDecimals={false} fontSize={12} />
          <Tooltip />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={colors?.[d.stage] ?? "transparent"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
