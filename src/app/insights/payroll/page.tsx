import Link from "next/link";
import { getPayrollInsights } from "@/actions/insights";
import { KpiCard } from "@/components/insights/kpi-card";
import { ChartCard } from "@/components/insights/chart-card";
import { StackedBars, SimpleBars, TrendArea } from "@/components/insights/charts";
import { INSIGHT_COLORS, formatINRCompact } from "@/lib/insights/chart-theme";

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

export default async function PayrollInsightsPage() {
  const result = await getPayrollInsights();

  if (!result.success) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-slate-400">
        {result.error}
      </div>
    );
  }

  // Plan doesn't include payroll
  if (result.data === null) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-50">Payroll Cost</h1>
        </div>
        <div className="rounded-2xl bg-white/[0.04] p-12 text-center ring-1 ring-white/10">
          <p className="text-sm font-medium text-slate-300">Payroll is not part of your plan</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
            Upgrade to Business to run payroll in JambaHR and unlock cost trends, department
            spend, and salary-band analytics here.
          </p>
          <Link
            href="/dashboard/settings#billing"
            className="mt-4 inline-block rounded-lg bg-violet-500/15 px-4 py-2 text-xs font-semibold text-violet-300 transition-colors hover:bg-violet-500/25"
          >
            View plans →
          </Link>
        </div>
      </div>
    );
  }

  const d = result.data;
  const hasRuns = d.monthly.length > 0;

  const compositionSeries = [
    { key: "net", label: "Net pay", color: INSIGHT_COLORS.violet },
    { key: "tds", label: "TDS", color: INSIGHT_COLORS.rose },
    { key: "pf", label: "Employee PF", color: INSIGHT_COLORS.amber },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-50">Payroll Cost</h1>
        <p className="mt-1 max-w-prose text-sm text-slate-400">
          What your team costs — processed and paid runs, up to the last 12 months.
        </p>
      </div>

      {!hasRuns ? (
        <div className="rounded-2xl bg-white/[0.04] p-12 text-center ring-1 ring-white/10">
          <p className="text-sm font-medium text-slate-300">No processed payroll runs yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
            Process your first run from the Payroll module and the cost analytics will light up here.
          </p>
          <Link
            href="/dashboard/payroll"
            className="mt-4 inline-block rounded-lg bg-violet-500/15 px-4 py-2 text-xs font-semibold text-violet-300 transition-colors hover:bg-violet-500/25"
          >
            Open Payroll →
          </Link>
        </div>
      ) : (
        <>
          {/* KPI row */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <KpiCard
              label="Net Payout"
              value={formatINRCompact(d.kpis.latestNet)}
              sub={monthLabel(d.kpis.latestMonth)}
            />
            <KpiCard
              label="Gross"
              value={formatINRCompact(d.kpis.latestGross)}
              sub="Before deductions"
            />
            <KpiCard
              label="TDS Withheld"
              value={formatINRCompact(d.kpis.latestTds)}
              sub="Latest run"
            />
            <KpiCard
              label="Avg / Employee"
              value={formatINRCompact(d.kpis.avgNetPerEmployee)}
              sub={`${d.kpis.employeesOnPayroll} on payroll`}
            />
            <KpiCard
              label="Projected Annual"
              value={formatINRCompact(d.kpis.projectedAnnualNet)}
              sub="Latest net × 12"
            />
          </div>

          {/* Charts */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="Monthly cost composition"
              sub="Net pay + TDS + employee PF per processed run"
              className="lg:col-span-2"
              exportRows={d.monthly}
              exportName="payroll-monthly"
            >
              <StackedBars
                data={d.monthly}
                series={compositionSeries}
                formatValue={formatINRCompact}
              />
            </ChartCard>

            <ChartCard
              title="Cost by department"
              sub="Net pay in the latest run"
              exportRows={d.costByDept}
              exportName="cost-by-department"
            >
              <SimpleBars
                data={d.costByDept}
                color={INSIGHT_COLORS.teal}
                formatValue={formatINRCompact}
              />
            </ChartCard>
            <ChartCard
              title="Salary bands"
              sub="Configured CTCs across the org"
              exportRows={d.salaryBands}
              exportName="salary-bands"
            >
              <SimpleBars data={d.salaryBands} color={INSIGHT_COLORS.sky} valueSuffix=" people" />
            </ChartCard>

            <ChartCard
              title="Overtime spend"
              sub="OT line items pushed to payroll, per month"
              className="lg:col-span-2"
              exportRows={d.otSpendMonthly}
              exportName="ot-spend-monthly"
            >
              <TrendArea
                data={d.otSpendMonthly}
                color={INSIGHT_COLORS.amber}
                formatValue={formatINRCompact}
              />
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}
