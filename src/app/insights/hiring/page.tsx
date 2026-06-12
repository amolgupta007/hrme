import Link from "next/link";
import { getHiringInsights } from "@/actions/insights";
import { KpiCard } from "@/components/insights/kpi-card";
import { ChartCard } from "@/components/insights/chart-card";
import { SimpleBars, StackedBars, Donut } from "@/components/insights/charts";
import { INSIGHT_COLORS } from "@/lib/insights/chart-theme";
import type { FunnelStage } from "@/actions/insights";

function Funnel({ stages }: { stages: FunnelStage[] }) {
  const max = Math.max(1, ...stages.map((s) => s.value));
  if (!stages.some((s) => s.value > 0)) {
    return (
      <p className="py-10 text-center text-sm text-slate-500">
        No applications yet — the funnel fills in as candidates apply.
      </p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {stages.map((s, i) => {
        const widthPct = Math.max(4, Math.round((s.value / max) * 100));
        return (
          <li key={s.name} className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-right text-xs text-slate-400">{s.name}</span>
            <div className="relative h-8 flex-1">
              <div
                className="flex h-full items-center justify-between rounded-lg bg-gradient-to-r from-violet-600/70 to-fuchsia-500/50 px-2.5 transition-all"
                style={{ width: `${widthPct}%` }}
              >
                <span className="text-xs font-semibold tabular-nums text-white">{s.value}</span>
              </div>
              {i > 0 && (
                <span className="absolute right-0 top-1/2 -translate-y-1/2 text-[11px] tabular-nums text-slate-500">
                  {s.conversionPct}% from prev
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default async function HiringInsightsPage() {
  const result = await getHiringInsights();

  if (!result.success) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-slate-400">
        {result.error}
      </div>
    );
  }

  if (result.data === null) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-50">Hiring</h1>
        </div>
        <div className="rounded-2xl bg-white/[0.04] p-12 text-center ring-1 ring-white/10">
          <p className="text-sm font-medium text-slate-300">JambaHire is not enabled</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
            Turn on the hiring module to see funnel conversion, time-to-hire, source
            effectiveness, and offer analytics here.
          </p>
          <Link
            href="/dashboard/settings"
            className="mt-4 inline-block rounded-lg bg-violet-500/15 px-4 py-2 text-xs font-semibold text-violet-300 transition-colors hover:bg-violet-500/25"
          >
            Enable in Settings →
          </Link>
        </div>
      </div>
    );
  }

  const d = result.data;
  const sourceSeries = [
    { key: "total", label: "Applications", color: INSIGHT_COLORS.sky },
    { key: "hired", label: "Hired", color: INSIGHT_COLORS.emerald },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-50">Hiring</h1>
        <p className="mt-1 max-w-prose text-sm text-slate-400">
          Pipeline health from first application to signed offer.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Open Positions" value={String(d.kpis.openJobs)} sub="Active job posts" />
        <KpiCard
          label="Applications"
          value={String(d.kpis.applications12m)}
          sub="Last 12 months"
        />
        <KpiCard
          label="Hires"
          value={String(d.kpis.hires12m)}
          sub="Last 12 months"
          delta={
            d.kpis.hires12m > 0 ? { value: `+${d.kpis.hires12m}`, direction: "up" } : undefined
          }
        />
        <KpiCard
          label="Time to Hire"
          value={d.kpis.avgTimeToHireDays > 0 ? `${d.kpis.avgTimeToHireDays}d` : "—"}
          sub="Applied → hired, average"
        />
        <KpiCard
          label="Offer Acceptance"
          value={`${d.kpis.offerAcceptancePct}%`}
          sub="Accepted vs declined"
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Pipeline funnel"
          sub="Applications that reached each stage (all time)"
          className="lg:col-span-2"
          exportRows={d.funnel}
          exportName="pipeline-funnel"
        >
          <Funnel stages={d.funnel} />
        </ChartCard>

        <ChartCard
          title="Time in stage"
          sub="Average days spent before moving on"
          exportRows={d.avgDaysInStage}
          exportName="time-in-stage"
        >
          <SimpleBars data={d.avgDaysInStage} color={INSIGHT_COLORS.amber} valueSuffix=" days" />
        </ChartCard>
        <ChartCard
          title="Source effectiveness"
          sub="Applications and hires by candidate source"
          exportRows={d.sources}
          exportName="source-effectiveness"
        >
          <StackedBars data={d.sources} series={sourceSeries} grouped />
        </ChartCard>

        <ChartCard
          title="Offer outcomes"
          sub="Every offer ever sent"
          exportRows={d.offerStatusDist}
          exportName="offer-outcomes"
        >
          <Donut data={d.offerStatusDist} centerLabel="offers" />
        </ChartCard>
        <ChartCard
          title="Rejections by stage"
          sub="Where candidates drop out of your process"
          exportRows={d.rejectionByStage}
          exportName="rejections-by-stage"
        >
          <SimpleBars data={d.rejectionByStage} color={INSIGHT_COLORS.rose} />
        </ChartCard>

        {d.loiDist.length > 0 && (
          <ChartCard
            title="LOI responses"
            sub="Letter-of-intent outcomes at the shortlist gate"
            className="lg:col-span-2"
            exportRows={d.loiDist}
            exportName="loi-responses"
          >
            <SimpleBars data={d.loiDist} color={INSIGHT_COLORS.teal} />
          </ChartCard>
        )}
      </div>
    </div>
  );
}
