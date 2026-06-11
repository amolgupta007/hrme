import { getWorkforceInsights } from "@/actions/insights";
import { KpiCard } from "@/components/insights/kpi-card";
import { ChartCard } from "@/components/insights/chart-card";
import {
  TrendArea,
  TrendLine,
  Donut,
  SimpleBars,
  JoinLeaveBars,
} from "@/components/insights/charts";
import { INSIGHT_COLORS } from "@/lib/insights/chart-theme";

export default async function WorkforceInsightsPage() {
  const result = await getWorkforceInsights();

  if (!result.success) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-slate-400">
        {result.error}
      </div>
    );
  }
  const d = result.data;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-50">Workforce</h1>
        <p className="mt-1 max-w-prose text-sm text-slate-400">
          Headcount movement, composition, and retention over the trailing 12 months.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Active" value={String(d.totals.active)} sub="Current headcount" />
        <KpiCard
          label="Joined"
          value={String(d.totals.joiners12m)}
          sub="Last 12 months"
          delta={
            d.totals.joiners12m > 0
              ? { value: `+${d.totals.joiners12m}`, direction: "up" }
              : undefined
          }
        />
        <KpiCard
          label="Left"
          value={String(d.totals.leavers12m)}
          sub="Last 12 months"
          delta={
            d.totals.leavers12m > 0
              ? { value: String(d.totals.leavers12m), direction: "up", goodWhenUp: false }
              : undefined
          }
        />
        <KpiCard
          label="Attrition"
          value={`${d.totals.attritionRatePct}%`}
          sub="Exits / avg headcount"
        />
        <KpiCard
          label="Avg Tenure"
          value={`${d.totals.avgTenureYears}y`}
          sub="Active employees"
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Headcount trend"
          sub="Active employees at each month end"
          className="lg:col-span-2"
        >
          <TrendArea data={d.headcountTrend} color={INSIGHT_COLORS.violet} />
        </ChartCard>

        <ChartCard title="Department distribution" sub="Active employees by department">
          <Donut data={d.deptDistribution} />
        </ChartCard>
        <ChartCard title="Employment type" sub="Full-time, part-time, contract, intern">
          <SimpleBars data={d.typeSplit} color={INSIGHT_COLORS.sky} />
        </ChartCard>

        <ChartCard title="Joiners vs leavers" sub="Monthly inflow and outflow">
          <JoinLeaveBars data={d.joinersLeavers} />
        </ChartCard>
        <ChartCard
          title="Attrition trend"
          sub="Cumulative exits over the window as a share of headcount"
        >
          <TrendLine data={d.attritionTrend} color={INSIGHT_COLORS.rose} />
        </ChartCard>

        <ChartCard
          title="Tenure distribution"
          sub="How long your current team has been with you"
          className="lg:col-span-2"
        >
          <SimpleBars data={d.tenureBuckets} color={INSIGHT_COLORS.amber} valueSuffix=" people" />
        </ChartCard>
      </div>
    </div>
  );
}
