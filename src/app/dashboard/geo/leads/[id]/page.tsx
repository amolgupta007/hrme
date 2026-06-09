import { notFound } from "next/navigation";
import { requireJambaGeoAccess } from "@/lib/jambageo-access";
import { getLead } from "@/actions/geo-leads";
import { listLeadVisits } from "@/actions/geo-visits";
import { LeadDetail } from "@/components/geo/lead-detail";
import { isManagerOrAbove } from "@/lib/current-user";

interface Props {
  params: { id: string };
}

export default async function LeadDetailPage({ params }: Props) {
  const ctx = await requireJambaGeoAccess();

  const leadRes = await getLead(params.id);
  if (!leadRes.success) notFound();

  const visitsRes = await listLeadVisits(params.id);
  const visits = visitsRes.success ? visitsRes.data : [];

  // Manager+ can always edit/log; employees can only if assigned to them.
  const canEdit =
    isManagerOrAbove(ctx.role) ||
    leadRes.data.assigned_to === ctx.employeeId;
  const canLogVisit =
    isManagerOrAbove(ctx.role) ||
    leadRes.data.assigned_to === ctx.employeeId;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{leadRes.data.name}</h1>
        {leadRes.data.company && (
          <p className="text-muted-foreground text-sm mt-1">
            {leadRes.data.company}
          </p>
        )}
      </div>
      <LeadDetail
        lead={leadRes.data}
        visits={visits as any}
        canEdit={canEdit}
        canLogVisit={canLogVisit}
      />
    </div>
  );
}
