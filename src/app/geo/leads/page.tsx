import { requireJambaGeoAccess } from "@/lib/jambageo-access";
import { listLeads } from "@/actions/geo-leads";
import { isManagerOrAbove } from "@/lib/current-user";
import type { LeadCardData } from "@/components/geo/lead-card";
import { LeadsPageClient } from "./client";

interface Props {
  searchParams: { view?: string };
}

export default async function LeadsPage({ searchParams }: Props) {
  const ctx = await requireJambaGeoAccess();
  const result = await listLeads();

  const leads: LeadCardData[] = (result.success ? result.data : []).map((r) => ({
    id: r.id,
    name: r.name,
    company: r.company,
    contact_phone: r.contact_phone,
    value_inr: r.value_inr,
    assigned_to: r.assigned_to,
    assignee_name: (r as any).assignee_name ?? null,
    stage: r.stage,
  }));

  const view = searchParams.view === "list" ? "list" : "kanban";
  const canCreate = isManagerOrAbove(ctx.role);
  const canDrag = isManagerOrAbove(ctx.role);

  return (
    <>
      {/* Page identity. The active section in the GeoHeader signals
          location, but the page itself owns its title — h1 lands in the
          document outline and gives screen-reader users a real heading to
          navigate by. */}
      <header className="mb-2">
        <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your sales pipeline. Drag cards across stages, log visits, and
          keep follow-ups on track.
        </p>
      </header>

      <LeadsPageClient
        leads={leads}
        view={view}
        canCreate={canCreate}
        canDrag={canDrag}
      />
    </>
  );
}
