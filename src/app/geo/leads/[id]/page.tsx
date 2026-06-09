import { notFound } from "next/navigation";
import { requireJambaGeoAccess } from "@/lib/jambageo-access";
import { getLead, listLeads } from "@/actions/geo-leads";
import { listLeadVisits } from "@/actions/geo-visits";
import { LeadDetail } from "@/components/geo/lead-detail";
import { LeadPageNav } from "@/components/geo/lead-page-nav";
import { isManagerOrAbove } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";

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

  // Resolve assignee name for the detail panel. `getLead` returns the
  // foreign-key id only, so we do one targeted lookup here rather than
  // widening the action surface (the kanban/list use a JOIN via `listLeads`,
  // but the detail page hits `getLead` for the scope check it needs).
  let assigneeName: string | null = null;
  if (leadRes.data.assigned_to) {
    const sb = createAdminSupabase();
    const { data: emp } = await sb
      .from("employees")
      .select("first_name,last_name")
      .eq("id", leadRes.data.assigned_to)
      .maybeSingle();
    if (emp) {
      const composed = `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim();
      assigneeName = composed.length > 0 ? composed : null;
    }
  }

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
      {/* Page identity comes first so it scrolls away on long detail pages
          and the sticky LeadPageNav below takes its place as the persistent
          context. Previously the lead name lived inside a <CardTitle>
          (h3-ish), which left the document outline without a real h1. */}
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          {leadRes.data.name}
        </h1>
        {leadRes.data.company && (
          <p className="mt-0.5 text-sm text-muted-foreground">
            {leadRes.data.company}
          </p>
        )}
      </header>

      <LeadPageNav prev={prev} next={next} position={position} />

      <LeadDetail
        lead={leadRes.data}
        visits={visits as any}
        canEdit={canEdit}
        canLogVisit={canLogVisit}
        assigneeName={assigneeName}
      />
    </>
  );
}
