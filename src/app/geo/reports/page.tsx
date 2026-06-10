import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireJambaGeoAccess } from "@/lib/jambageo-access";
import { isManagerOrAbove } from "@/lib/current-user";
import { getLeadFunnel, getOverdueFollowUps } from "@/actions/geo-reports";
import { FunnelChart } from "@/components/geo/funnel-chart";
import { OverdueFollowUps } from "@/components/geo/overdue-followups";
import { GeoPageHeader } from "@/components/geo/geo-page-header";

export default async function ReportsPage() {
  const ctx = await requireJambaGeoAccess();
  if (!isManagerOrAbove(ctx.role)) redirect("/geo/leads");

  const [funnelResult, overdueResult] = await Promise.all([
    getLeadFunnel(),
    getOverdueFollowUps(),
  ]);

  return (
    <>
      <GeoPageHeader
        title="Reports"
        lede="Pipeline health at a glance. Funnel by stage and the overdue follow-ups worth chasing this week."
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
