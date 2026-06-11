// Single source of truth for the Insights module's visual language.
// Pure module (no "use client") so both server pages and client chart
// components can import from it — see CLAUDE.md gotcha #78.

import type * as React from "react";

export const INSIGHT_COLORS = {
  violet: "#8b5cf6",
  teal: "#2dd4bf",
  sky: "#38bdf8",
  amber: "#fbbf24",
  rose: "#fb7185",
  emerald: "#34d399",
  slate: "#64748b",
} as const;

/** Ordered palette for categorical series (donut slices, dept bars). */
export const CATEGORY_PALETTE: string[] = [
  INSIGHT_COLORS.violet,
  INSIGHT_COLORS.teal,
  INSIGHT_COLORS.amber,
  INSIGHT_COLORS.sky,
  INSIGHT_COLORS.rose,
  INSIGHT_COLORS.emerald,
  "#c084fc",
  "#f472b6",
  "#a3e635",
  "#fb923c",
];

export const CHART_GRID_STROKE = "rgba(148, 163, 184, 0.12)";
export const CHART_AXIS_COLOR = "#94a3b8";

export const TOOLTIP_STYLE: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  borderRadius: 12,
  color: "#e2e8f0",
  fontSize: 12,
  padding: "8px 12px",
};

/** ₹12,40,000 → "₹12.4L"; ₹2,30,00,000 → "₹2.3Cr" */
export function formatINRCompact(value: number): string {
  if (value >= 1_00_00_000) return `₹${(value / 1_00_00_000).toFixed(1)}Cr`;
  if (value >= 1_00_000) return `₹${(value / 1_00_000).toFixed(1)}L`;
  if (value >= 1_000) return `₹${(value / 1_000).toFixed(1)}k`;
  return `₹${Math.round(value)}`;
}
