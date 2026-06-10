import { notFound } from "next/navigation";
import { requireJambaGeoAccess } from "@/lib/jambageo-access";
import { getLead, getLeadSiblings } from "@/actions/geo-leads";
import { listLeadVisits } from "@/actions/geo-visits";
import { LeadDetailShell } from "@/components/geo/lead-detail-shell";
import { GeoPageHeader } from "@/components/geo/geo-page-header";
import { isManagerOrAbove } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";

interface Props {
  params: { id: string };
}

export default async function LeadDetailPage({ params }: Props) {
  const ctx = await requireJambaGeoAccess();

  const leadRes = await getLead(params.id);
  if (!leadRes.success) notFound();

  // Three parallel fetches: the visit history, the prev/next siblings
  // (id+name only via getLeadSiblings — ~10× cheaper than listLeads({})
  // for orgs with 500+ leads), and the assignee name resolution.
  const [visitsRes, siblingsRes, assigneeName] = await Promise.all([
    listLeadVisits(params.id),
    getLeadSiblings(params.id),
    resolveAssigneeName(leadRes.data.assigned_to),
  ]);

  const visits = visitsRes.success ? visitsRes.data : [];
  const visitsError = !visitsRes.success;
  const siblings = siblingsRes.success
    ? siblingsRes.data
    : { prev: null, next: null, position: null };

  // Manager+ can always edit/log; employees can only if assigned to them.
  const canEdit =
    isManagerOrAbove(ctx.role) || leadRes.data.assigned_to === ctx.employeeId;
  const canLogVisit =
    isManagerOrAbove(ctx.role) || leadRes.data.assigned_to === ctx.employeeId;

  return (
    <>
      {/* Page identity comes first so it scrolls away on long detail pages
          and the sticky LeadPageNav below takes its place as the persistent
          context. */}
      <GeoPageHeader
        title={leadRes.data.name}
        lede={leadRes.data.company ?? undefined}
      />

      <LeadDetailShell
        lead={leadRes.data}
        visits={visits as any}
        canEdit={canEdit}
        canLogVisit={canLogVisit}
        assigneeName={assigneeName}
        visitsError={visitsError}
        prev={siblings.prev}
        next={siblings.next}
        position={siblings.position ?? undefined}
      />
    </>
  );
}

/** Single targeted Supabase lookup for the assignee's display name. */
async function resolveAssigneeName(
  assignedTo: string | null,
): Promise<string | null> {
  if (!assignedTo) return null;
  const sb = createAdminSupabase();
  const { data: emp } = await sb
    .from("employees")
    .select("first_name,last_name")
    .eq("id", assignedTo)
    .maybeSingle();
  if (!emp) return null;
  const composed = `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim();
  return composed.length > 0 ? composed : null;
}
