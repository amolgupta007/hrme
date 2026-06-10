import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireJambaGeoAccess } from "@/lib/jambageo-access";
import { isManagerOrAbove } from "@/lib/current-user";
import { getLeadFunnel, getOverdueFollowUps } from "@/actions/geo-reports";
import { FunnelChart } from "@/components/geo/funnel-chart";
import { OverdueFollowUps } from "@/components/geo/overdue-followups";
import { GeoPageHeader } from "@/components/geo/geo-page-header";
import { ReportsRangeFilter } from "@/components/geo/reports-range-filter";
import { resolveRangeFrom } from "@/lib/geo/report-range";

interface Props {
  searchParams: { range?: string };
}

export default async function ReportsPage({ searchParams }: Props) {
  const ctx = await requireJambaGeoAccess();
  if (!isManagerOrAbove(ctx.role)) redirect("/geo/leads");

  // Resolve the active range once and feed both actions. URL-driven so the
  // current filter is shareable + survives reload.
  const from = resolveRangeFrom(searchParams.range);

  const [funnelResult, overdueResult] = await Promise.all([
    getLeadFunnel(from ? { from } : {}),
    getOverdueFollowUps(from ? { from } : {}),
  ]);

  return (
    <>
      <GeoPageHeader
        title="Reports"
        lede="Pipeline health at a glance. Funnel by stage and the overdue follow-ups worth chasing this week."
        rightSlot={<ReportsRangeFilter />}
      />

      <div className="grid md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Lead funnel</CardTitle>
        </CardHeader>
        <CardContent>
          <FunnelChart data={funnelResult.success ? funnelResult.data : []} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Overdue follow-ups</CardTitle>
        </CardHeader>
        <CardContent>
          <OverdueFollowUps rows={overdueResult.success ? overdueResult.data : []} />
        </CardContent>
      </Card>
      </div>
    </>
  );
}
