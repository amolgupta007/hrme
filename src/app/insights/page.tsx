import { getOverviewInsights } from "@/actions/insights";
import { KpiCard } from "@/components/insights/kpi-card";
import { ChartCard } from "@/components/insights/chart-card";
import { TrendArea, Donut, SimpleBars, JoinLeaveBars } from "@/components/insights/charts";
import { INSIGHT_COLORS, formatINRCompact } from "@/lib/insights/chart-theme";

function payrollMonthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

export default async function InsightsOverviewPage() {
  const result = await getOverviewInsights();

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
        <h1 className="text-2xl font-bold tracking-tight text-slate-50">Overview</h1>
        <p className="mt-1 max-w-prose text-sm text-slate-400">
          The state of your organisation at a glance — trailing 12 months unless noted.
        </p>
      </div>

      {/* KPI hero row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Headcount"
          value={String(d.headcount)}
          sub={d.headcountDelta30d > 0 ? `+${d.headcountDelta30d} in 30 days` : "Active employees"}
          delta={
            d.headcountDelta30d > 0
              ? { value: `+${d.headcountDelta30d}`, direction: "up" }
              : undefined
          }
          spark={d.headcountTrend}
          sparkColor={INSIGHT_COLORS.violet}
        />
        <KpiCard
          label="Attrition"
          value={`${d.attritionRatePct}%`}
          sub="Trailing 12 months"
          delta={
            d.attritionRatePct > 0
              ? { value: `${d.attritionRatePct}%`, direction: "up", goodWhenUp: false }
              : undefined
          }
        />
        <KpiCard
          label="Payroll Cost"
          value={d.monthlyPayrollCost !== null ? formatINRCompact(d.monthlyPayrollCost) : "—"}
          sub={
            d.payrollMonth
              ? `Net · ${payrollMonthLabel(d.payrollMonth)}`
              : "No processed runs yet"
          }
        />
        <KpiCard
          label="Leave Utilisation"
          value={`${d.leaveUtilizationPct}%`}
          sub={`${d.leaveDaysTaken12m} days taken in 12 mo`}
        />
        <KpiCard
          label="Training"
          value={`${d.trainingCompliancePct}%`}
          sub={
            d.overdueTrainingCount > 0
              ? `${d.overdueTrainingCount} overdue enrollments`
              : "All on track"
          }
          delta={
            d.overdueTrainingCount > 0
              ? { value: String(d.overdueTrainingCount), direction: "down", goodWhenUp: true }
              : undefined
          }
        />
        <KpiCard
          label="Open Positions"
          value={d.openPositions !== null ? String(d.openPositions) : "—"}
          sub={
            d.openPositions !== null
              ? `${d.totalApplications ?? 0} total applications`
              : "JambaHire not enabled"
          }
        />
      </div>

      {/* Chart grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Headcount trend" sub="Active employees at each month end">
          <TrendArea data={d.headcountTrend} color={INSIGHT_COLORS.violet} />
        </ChartCard>
        <ChartCard title="Department distribution" sub="Active employees by department">
          <Donut data={d.deptDistribution} />
        </ChartCard>
        <ChartCard title="Leave taken per month" sub="Approved leave days, by start month">
          <SimpleBars data={d.leaveByMonth} color={INSIGHT_COLORS.teal} valueSuffix=" days" />
        </ChartCard>
        <ChartCard title="Joiners vs leavers" sub="Monthly inflow and outflow">
          <JoinLeaveBars data={d.joinersLeavers} />
        </ChartCard>
      </div>
    </div>
  );
}
