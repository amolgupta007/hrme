import { getOverviewInsights } from "@/actions/insights";
import { KpiCard } from "@/components/insights/kpi-card";
import { PerOrgSplit } from "@/components/insights/per-org-split";
import { ChartCard } from "@/components/insights/chart-card";
import { TrendArea, Donut, SimpleBars, JoinLeaveBars } from "@/components/insights/charts";
import { INSIGHT_COLORS, formatINRCompact } from "@/lib/insights/chart-theme";

function payrollMonthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

export default async function InsightsOverviewPage({
  searchParams,
}: {
  searchParams?: { orgs?: string };
}) {
  const orgIds = searchParams?.orgs?.split(",").filter(Boolean);
  const result = await getOverviewInsights(orgIds);

  if (!result.success) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-slate-400">
        {result.error}
      </div>
    );
  }
  const d = result.data;
  const c = d.compare;

  const attritionDeltaPts = Math.round((d.attritionRatePct - c.attritionPrevPct) * 10) / 10;
  const payrollDeltaPct =
    d.monthlyPayrollCost !== null && c.payrollPrevNet !== null && c.payrollPrevNet > 0
      ? Math.round(((d.monthlyPayrollCost - c.payrollPrevNet) / c.payrollPrevNet) * 100)
      : null;
  const leaveDeltaPct =
    c.leaveDaysPrev12m > 0
      ? Math.round(((d.leaveDaysTaken12m - c.leaveDaysPrev12m) / c.leaveDaysPrev12m) * 100)
      : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-50">Overview</h1>
        <p className="mt-1 max-w-prose text-sm text-slate-400">
          The state of your organisation at a glance — trailing 12 months unless noted, deltas
          vs the period before.
        </p>
      </div>

      {/* KPI hero row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div>
          <KpiCard
            label="Headcount"
            value={String(d.headcount)}
            sub={d.headcountDelta30d > 0 ? `+${d.headcountDelta30d} in 30 days` : "Active employees"}
            delta={
              c.headcountYoYPct !== 0
                ? {
                    value: `${c.headcountYoYPct > 0 ? "+" : ""}${c.headcountYoYPct}% YoY`,
                    direction: c.headcountYoYPct > 0 ? "up" : "down",
                  }
                : undefined
            }
            spark={d.headcountTrend}
            sparkColor={INSIGHT_COLORS.violet}
          />
          <PerOrgSplit
            items={d.byOrg.map((o) => ({ orgName: o.orgName, value: String(o.headcount) }))}
          />
        </div>
        <div>
          <KpiCard
            label="Attrition"
            value={`${d.attritionRatePct}%`}
            sub={`Prior period: ${c.attritionPrevPct}%`}
            delta={
              attritionDeltaPts !== 0
                ? {
                    value: `${attritionDeltaPts > 0 ? "+" : ""}${attritionDeltaPts}pt`,
                    direction: attritionDeltaPts > 0 ? "up" : "down",
                    goodWhenUp: false,
                  }
                : undefined
            }
          />
          <PerOrgSplit
            items={d.byOrg.map((o) => ({ orgName: o.orgName, value: `${o.attritionRatePct}%` }))}
          />
        </div>
        <div>
          <KpiCard
            label="Payroll Cost"
            value={d.monthlyPayrollCost !== null ? formatINRCompact(d.monthlyPayrollCost) : "—"}
            sub={
              d.payrollMonth
                ? `Net · ${payrollMonthLabel(d.payrollMonth)}`
                : "No processed runs yet"
            }
            delta={
              payrollDeltaPct !== null && payrollDeltaPct !== 0
                ? {
                    value: `${payrollDeltaPct > 0 ? "+" : ""}${payrollDeltaPct}% MoM`,
                    direction: payrollDeltaPct > 0 ? "up" : "down",
                    goodWhenUp: false,
                  }
                : undefined
            }
          />
          <PerOrgSplit
            items={d.byOrg.map((o) => ({
              orgName: o.orgName,
              value: formatINRCompact(o.monthlyPayrollCost),
            }))}
          />
        </div>
        <div>
          <KpiCard
            label="Leave Utilisation"
            value={`${d.leaveUtilizationPct}%`}
            sub={`${d.leaveDaysTaken12m} days taken in 12 mo`}
            delta={
              leaveDeltaPct !== null && leaveDeltaPct !== 0
                ? {
                    value: `${leaveDeltaPct > 0 ? "+" : ""}${leaveDeltaPct}%`,
                    direction: leaveDeltaPct > 0 ? "up" : "down",
                  }
                : undefined
            }
          />
          <PerOrgSplit
            items={d.byOrg.map((o) => ({ orgName: o.orgName, value: `${o.leaveUtilizationPct}%` }))}
          />
        </div>
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
        <ChartCard
          title="Headcount trend"
          sub="Active employees at each month end"
          exportRows={d.headcountTrend}
          exportName="headcount-trend"
        >
          <TrendArea data={d.headcountTrend} color={INSIGHT_COLORS.violet} />
        </ChartCard>
        <ChartCard
          title="Department distribution"
          sub="Active employees by department"
          exportRows={d.deptDistribution}
          exportName="department-distribution"
        >
          <Donut data={d.deptDistribution} />
        </ChartCard>
        <ChartCard
          title="Leave taken per month"
          sub="Approved leave days, by start month"
          exportRows={d.leaveByMonth}
          exportName="leave-by-month"
        >
          <SimpleBars data={d.leaveByMonth} color={INSIGHT_COLORS.teal} valueSuffix=" days" />
        </ChartCard>
        <ChartCard
          title="Joiners vs leavers"
          sub="Monthly inflow and outflow"
          exportRows={d.joinersLeavers}
          exportName="joiners-vs-leavers"
        >
          <JoinLeaveBars data={d.joinersLeavers} />
        </ChartCard>
      </div>
    </div>
  );
}
