"use client";

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

const STAGE_COLORS: Record<string, string> = {
  new: "#94a3b8",
  contacted: "#60a5fa",
  visited: "#a78bfa",
  negotiation: "#f59e0b",
  converted: "#10b981",
  lost: "#ef4444",
};

interface FunnelChartProps {
  data: { stage: LeadStage; count: number }[];
}

export function FunnelChart({ data }: FunnelChartProps) {
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
              <Cell key={i} fill={STAGE_COLORS[d.stage] ?? "#64748b"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
