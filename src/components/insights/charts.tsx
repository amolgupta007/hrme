"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import {
  INSIGHT_COLORS,
  CATEGORY_PALETTE,
  CHART_GRID_STROKE,
  CHART_AXIS_COLOR,
  TOOLTIP_STYLE,
} from "@/lib/insights/chart-theme";
import type { MonthPoint, NamedCount, JoinLeavePoint } from "@/actions/insights";

function EmptyChart({ message = "Not enough data yet" }: { message?: string }) {
  return (
    <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-1 text-center">
      <p className="text-sm font-medium text-slate-400">{message}</p>
      <p className="text-xs text-slate-600">This chart fills in as your team uses JambaHR.</p>
    </div>
  );
}

const axisProps = {
  stroke: CHART_AXIS_COLOR,
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

// ---- Sparkline (KPI cards) ----

export function Sparkline({ data, color = INSIGHT_COLORS.violet }: { data: MonthPoint[]; color?: string }) {
  if (!data.length) return null;
  const id = `spark-${color.replace("#", "")}`;
  return (
    <ResponsiveContainer width="100%" height={40}>
      <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#${id})`}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ---- Area trend (headcount) ----

export function TrendArea({
  data,
  color = INSIGHT_COLORS.violet,
  valueSuffix = "",
}: {
  data: MonthPoint[];
  color?: string;
  valueSuffix?: string;
}) {
  if (!data.some((d) => d.value > 0)) return <EmptyChart />;
  const id = `trend-${color.replace("#", "")}`;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={CHART_GRID_STROKE} vertical={false} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} allowDecimals={false} width={40} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(v: number) => [`${v}${valueSuffix}`, ""]}
          separator=""
          cursor={{ stroke: "rgba(148,163,184,0.25)" }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${id})`}
          animationDuration={600}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ---- Line trend (attrition %) ----

export function TrendLine({ data, color = INSIGHT_COLORS.rose }: { data: MonthPoint[]; color?: string }) {
  if (!data.length) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid stroke={CHART_GRID_STROKE} vertical={false} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} width={40} unit="%" />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(v: number) => [`${v}%`, ""]}
          separator=""
          cursor={{ stroke: "rgba(148,163,184,0.25)" }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          dot={{ r: 2.5, fill: color, strokeWidth: 0 }}
          animationDuration={600}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ---- Simple vertical bars (leave by month, tenure, type split) ----

export function SimpleBars({
  data,
  color = INSIGHT_COLORS.teal,
  valueSuffix = "",
}: {
  data: { label?: string; name?: string; value: number }[];
  color?: string;
  valueSuffix?: string;
}) {
  if (!data.some((d) => d.value > 0)) return <EmptyChart />;
  const key = data[0]?.label !== undefined ? "label" : "name";
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid stroke={CHART_GRID_STROKE} vertical={false} />
        <XAxis dataKey={key} {...axisProps} interval={0} />
        <YAxis {...axisProps} allowDecimals={false} width={40} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(v: number) => [`${v}${valueSuffix}`, ""]}
          separator=""
          cursor={{ fill: "rgba(148,163,184,0.08)" }}
        />
        <Bar dataKey="value" fill={color} radius={[6, 6, 0, 0]} animationDuration={600} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---- Joiners vs leavers (diverging bars) ----

export function JoinLeaveBars({ data }: { data: JoinLeavePoint[] }) {
  if (!data.some((d) => d.joiners > 0 || d.leavers > 0)) return <EmptyChart />;
  const plotted = data.map((d) => ({ ...d, leavers: -d.leavers }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={plotted} stackOffset="sign" margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid stroke={CHART_GRID_STROKE} vertical={false} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis
          {...axisProps}
          allowDecimals={false}
          width={40}
          tickFormatter={(v: number) => String(Math.abs(v))}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(v: number, name: string) => [
            Math.abs(v),
            name === "joiners" ? "Joined" : "Left",
          ]}
          cursor={{ fill: "rgba(148,163,184,0.08)" }}
        />
        <ReferenceLine y={0} stroke={CHART_GRID_STROKE} />
        <Bar dataKey="joiners" stackId="flow" fill={INSIGHT_COLORS.emerald} radius={[6, 6, 0, 0]} animationDuration={600} />
        <Bar dataKey="leavers" stackId="flow" fill={INSIGHT_COLORS.rose} radius={[0, 0, 6, 6]} animationDuration={600} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---- Donut (department distribution) ----

export function Donut({ data }: { data: NamedCount[] }) {
  if (!data.length || !data.some((d) => d.value > 0)) return <EmptyChart />;
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative h-[220px] w-[220px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={70}
              outerRadius={100}
              paddingAngle={3}
              strokeWidth={0}
              animationDuration={600}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={TOOLTIP_STYLE} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold tabular-nums text-slate-100">{total}</span>
          <span className="text-[10px] uppercase tracking-wider text-slate-500">people</span>
        </div>
      </div>
      <ul className="grid w-full grid-cols-1 gap-1.5 text-sm">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length] }}
            />
            <span className="flex-1 truncate text-slate-300">{d.name}</span>
            <span className="tabular-nums text-slate-400">{d.value}</span>
            <span className="w-10 text-right text-xs tabular-nums text-slate-600">
              {total > 0 ? Math.round((d.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
