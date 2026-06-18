import Link from "next/link";
import { getLeaveAttendanceInsights } from "@/actions/insights";
import { KpiCard } from "@/components/insights/kpi-card";
import { PerOrgSplit } from "@/components/insights/per-org-split";
import { ChartCard } from "@/components/insights/chart-card";
import { StackedBars, TrendArea, TrendLine, SimpleBars } from "@/components/insights/charts";
import { INSIGHT_COLORS, CATEGORY_PALETTE } from "@/lib/insights/chart-theme";

const LEAVE_TYPE_LABELS: Record<string, string> = {
  paid: "Paid",
  sick: "Sick",
  casual: "Casual",
  unpaid: "Unpaid",
  earned: "Earned",
  maternity: "Maternity",
  paternity: "Paternity",
  custom: "Custom",
};

export default async function LeaveInsightsPage({
  searchParams,
}: {
  searchParams?: { orgs?: string };
}) {
  const orgIds = searchParams?.orgs?.split(",").filter(Boolean);
  const result = await getLeaveAttendanceInsights(orgIds);

  if (!result.success) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-slate-400">
        {result.error}
      </div>
    );
  }
  const d = result.data;
  const att = d.attendance;

  const leaveSeries = d.leaveTypes.map((t, i) => ({
    key: t,
    label: LEAVE_TYPE_LABELS[t] ?? t,
    color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-50">Leave &amp; Attendance</h1>
        <p className="mt-1 max-w-prose text-sm text-slate-400">
          How your team takes time off and shows up — trailing 12 months.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <KpiCard label="Leave Taken" value={`${d.kpis.daysTaken12m}d`} sub="Approved days, 12 months" />
          <PerOrgSplit
            items={d.byOrg.map((o) => ({ orgName: o.orgName, value: `${o.daysTaken}d` }))}
          />
        </div>
        <KpiCard
          label="Utilisation"
          value={`${d.kpis.utilizationPct}%`}
          sub="Of this year's allocation"
        />
        <KpiCard
          label="Avg / Employee"
          value={`${d.kpis.avgDaysPerEmployee}d`}
          sub="Days taken per active employee"
        />
        <KpiCard
          label="Pending Now"
          value={String(d.kpis.pendingNow)}
          sub={d.kpis.pendingNow > 0 ? "Awaiting approval" : "All clear"}
          delta={
            d.kpis.pendingNow > 0
              ? { value: String(d.kpis.pendingNow), direction: "up", goodWhenUp: false }
              : undefined
          }
        />
      </div>

      {/* Leave charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Leave by type"
          sub="Approved days per month, stacked by leave type"
          className="lg:col-span-2"
          exportRows={d.leaveByTypeMonthly}
          exportName="leave-by-type-monthly"
        >
          <StackedBars data={d.leaveByTypeMonthly} series={leaveSeries} />
        </ChartCard>

        <ChartCard
          title="Balances at risk of lapse"
          sub="Highest remaining balances this year — nudge these people to take time off"
          className="lg:col-span-2"
          exportRows={d.topBalances}
          exportName="balances-at-risk"
        >
          {d.topBalances.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No balance data yet.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {d.topBalances.map((b) => {
                const pct = b.total > 0 ? Math.round((b.remaining / b.total) * 100) : 0;
                return (
                  <li key={b.name} className="flex items-center gap-4 py-2.5">
                    <span className="w-44 truncate text-sm text-slate-300">{b.name}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-teal-500 to-teal-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-24 text-right text-sm tabular-nums text-slate-400">
                      {b.remaining}<span className="text-slate-600"> / {b.total}d left</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </ChartCard>
      </div>

      {/* Attendance section */}
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-slate-100">Attendance</h2>
        {att.excludedOrgs && att.excludedOrgs.length > 0 && (
          <p className="mt-1 text-xs text-slate-500">
            Not included: {att.excludedOrgs.map((o) => `${o.orgName} (${o.reason})`).join(", ")}
          </p>
        )}
        {!att.enabled ? (
          <div className="mt-3 rounded-2xl bg-white/[0.04] p-8 text-center ring-1 ring-white/10">
            <p className="text-sm font-medium text-slate-300">Attendance module is not enabled</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
              Turn it on to see presence trends, average clock-in times, and overtime by department.
            </p>
            <Link
              href="/dashboard/settings"
              className="mt-4 inline-block rounded-lg bg-violet-500/15 px-4 py-2 text-xs font-semibold text-violet-300 transition-colors hover:bg-violet-500/25"
            >
              Enable in Settings →
            </Link>
          </div>
        ) : !att.available ? (
          <div className="mt-3 rounded-2xl bg-white/[0.04] p-8 text-center ring-1 ring-white/10">
            <p className="text-sm font-medium text-slate-300">Attendance analytics not provisioned</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
              Run migration <code className="text-slate-400">059_insights_attendance_rollup.sql</code> in
              the Supabase SQL Editor to enable the monthly rollup, then reload.
            </p>
          </div>
        ) : (
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="Presence"
              sub="Clocked-in days per month"
              exportRows={att.presentDays}
              exportName="presence"
            >
              <TrendArea data={att.presentDays} color={INSIGHT_COLORS.sky} valueSuffix=" days" />
            </ChartCard>
            <ChartCard
              title="Average clock-in"
              sub="Mean first punch, IST"
              exportRows={att.avgClockInMinutes}
              exportName="avg-clock-in"
            >
              <TrendLine
                data={att.avgClockInMinutes}
                color={INSIGHT_COLORS.amber}
                format="timeOfDay"
              />
            </ChartCard>
            <ChartCard
              title="Average daily hours"
              sub="Worked minutes per present day"
              exportRows={att.avgDailyHours}
              exportName="avg-daily-hours"
            >
              <TrendLine
                data={att.avgDailyHours}
                color={INSIGHT_COLORS.teal}
                format="plain"
                valueSuffix="h"
              />
            </ChartCard>
            <ChartCard
              title="Forgotten clock-outs"
              sub="Shifts auto-closed by the midnight sweep — high numbers mean low punch discipline"
              exportRows={att.autoClosed}
              exportName="auto-closed-shifts"
            >
              <SimpleBars data={att.autoClosed} color={INSIGHT_COLORS.rose} valueSuffix=" shifts" />
            </ChartCard>
            <ChartCard
              title="Overtime by department"
              sub="Approved + pushed OT hours, 12 months"
              className="lg:col-span-2"
              exportRows={att.otHoursByDept}
              exportName="ot-hours-by-dept"
            >
              <SimpleBars data={att.otHoursByDept} color={INSIGHT_COLORS.violet} valueSuffix=" hrs" />
            </ChartCard>
          </div>
        )}
      </div>
    </div>
  );
}
