import { notFound } from "next/navigation";
import { requireJambaGeoAccess } from "@/lib/jambageo-access";
import { getLead, listLeads } from "@/actions/geo-leads";
import { listLeadVisits } from "@/actions/geo-visits";
import { LeadDetail } from "@/components/geo/lead-detail";
import { LeadPageNav } from "@/components/geo/lead-page-nav";
import { isManagerOrAbove } from "@/lib/current-user";

interface Props {
  params: { id: string };
}

export default async function LeadDetailPage({ params }: Props) {
  const ctx = await requireJambaGeoAccess();

  const leadRes = await getLead(params.id);
  if (!leadRes.success) notFound();

  const [visitsRes, siblingsRes] = await Promise.all([
    listLeadVisits(params.id),
    // Same default order as the kanban / list view (updated_at DESC). Scope is
    // applied by listLeads server-side — admin sees all, manager sees own dept
    // + unassigned, employee sees own assignments only. So the prev/next walk
    // stays inside what the caller is allowed to read.
    listLeads({}),
  ]);
  const visits = visitsRes.success ? visitsRes.data : [];
  const siblings = siblingsRes.success ? siblingsRes.data : [];

  const idx = siblings.findIndex((l) => l.id === params.id);
  const prev = idx > 0 ? { id: siblings[idx - 1].id, name: siblings[idx - 1].name } : null;
  const next =
    idx >= 0 && idx < siblings.length - 1
      ? { id: siblings[idx + 1].id, name: siblings[idx + 1].name }
      : null;
  const position = idx >= 0 ? { index: idx + 1, total: siblings.length } : undefined;

  // Manager+ can always edit/log; employees can only if assigned to them.
  const canEdit =
    isManagerOrAbove(ctx.role) || leadRes.data.assigned_to === ctx.employeeId;
  const canLogVisit =
    isManagerOrAbove(ctx.role) || leadRes.data.assigned_to === ctx.employeeId;

  return (
    <>
      <LeadPageNav prev={prev} next={next} position={position} />
      <LeadDetail
        lead={leadRes.data}
        visits={visits as any}
        canEdit={canEdit}
        canLogVisit={canLogVisit}
      />
    </>
  );
}
