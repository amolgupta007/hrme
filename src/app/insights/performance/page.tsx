import { getPerformanceTrainingInsights } from "@/actions/insights";
import { KpiCard } from "@/components/insights/kpi-card";
import { ChartCard } from "@/components/insights/chart-card";
import { SimpleBars, StackedBars } from "@/components/insights/charts";
import { INSIGHT_COLORS } from "@/lib/insights/chart-theme";

export default async function PerformanceInsightsPage() {
  const result = await getPerformanceTrainingInsights();

  if (!result.success) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-slate-400">
        {result.error}
      </div>
    );
  }
  const d = result.data;

  const ratingSeries = [
    { key: "self", label: "Self rating", color: INSIGHT_COLORS.sky },
    { key: "manager", label: "Manager rating", color: INSIGHT_COLORS.violet },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-50">
          Performance &amp; Training
        </h1>
        <p className="mt-1 max-w-prose text-sm text-slate-400">
          Review outcomes, objective achievement, and compliance posture.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          label="Avg Rating"
          value={
            d.kpis.avgManagerRating > 0
              ? `${d.kpis.avgManagerRating}/${d.kpis.ratingScale}`
              : "—"
          }
          sub={d.latestCycleName ? `Manager · ${d.latestCycleName}` : "No review cycles yet"}
        />
        <KpiCard
          label="Reviews Done"
          value={`${d.kpis.reviewsCompletionPct}%`}
          sub={d.latestCycleName ?? "No cycle"}
        />
        <KpiCard
          label="Objectives Met"
          value={`${d.kpis.objectivesAchievementPct}%`}
          sub="Across approved objectives"
        />
        <KpiCard
          label="Training"
          value={`${d.kpis.trainingCompliancePct}%`}
          sub="Org-wide completion"
        />
        <KpiCard
          label="Overdue"
          value={String(d.kpis.overdueEnrollments)}
          sub={d.kpis.overdueEnrollments > 0 ? "Enrollments need action" : "All clear"}
          delta={
            d.kpis.overdueEnrollments > 0
              ? { value: String(d.kpis.overdueEnrollments), direction: "up", goodWhenUp: false }
              : undefined
          }
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Rating distribution"
          sub={
            d.latestCycleName
              ? `Self vs manager · ${d.latestCycleName} (scale of ${d.kpis.ratingScale})`
              : "Self vs manager ratings"
          }
          className="lg:col-span-2"
          exportRows={d.ratingDist}
          exportName="rating-distribution"
        >
          <StackedBars data={d.ratingDist} series={ratingSeries} grouped />
        </ChartCard>

        <ChartCard
          title="Objectives by department"
          sub="Items marked achieved, % of total"
          exportRows={d.objectivesByDept}
          exportName="objectives-by-department"
        >
          <SimpleBars data={d.objectivesByDept} color={INSIGHT_COLORS.emerald} valueSuffix="%" />
        </ChartCard>
        <ChartCard
          title="Training compliance by department"
          sub="Completed enrollments, % of assigned"
          exportRows={d.trainingByDept}
          exportName="training-by-department"
        >
          <SimpleBars data={d.trainingByDept} color={INSIGHT_COLORS.teal} valueSuffix="%" />
        </ChartCard>

        <ChartCard
          title="Overdue training by course"
          sub="Which courses are blocking compliance"
          className="lg:col-span-2"
          exportRows={d.overdueByCourse}
          exportName="overdue-by-course"
        >
          {d.overdueByCourse.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">
              Nothing overdue — your team is on track.
            </p>
          ) : (
            <ul className="divide-y divide-white/5">
              {d.overdueByCourse.map((c) => {
                const max = Math.max(1, ...d.overdueByCourse.map((x) => x.value));
                return (
                  <li key={c.name} className="flex items-center gap-4 py-2.5">
                    <span className="w-56 truncate text-sm text-slate-300">{c.name}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-rose-500 to-rose-300"
                        style={{ width: `${Math.round((c.value / max) * 100)}%` }}
                      />
                    </div>
                    <span className="w-20 text-right text-sm tabular-nums text-slate-400">
                      {c.value} <span className="text-slate-600">overdue</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
