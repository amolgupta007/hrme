import { Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { requireJambaGeoAccess } from "@/lib/jambageo-access";
import { getMyAssignedLeads } from "@/actions/geo-reports";
import { stageBadgeVariant, stageLabel } from "@/lib/geo/stages";
import { GeoPageHeader } from "@/components/geo/geo-page-header";
import Link from "next/link";
import { formatDate } from "@/lib/utils";

export default async function MyLeadsPage() {
  await requireJambaGeoAccess();
  const res = await getMyAssignedLeads();
  const leads = res.success ? res.data : [];

  return (
    <>
      <GeoPageHeader
        title="My leads"
        lede="Leads currently assigned to you. Open one to log a visit, call, or move it through the pipeline."
      />

      {leads.length === 0 ? (
        <div className="rounded-md border border-dashed bg-muted/20 px-6 py-12 text-center text-sm text-muted-foreground">
          No leads assigned yet. Your manager assigns leads from the main
          pipeline — once they do, you&apos;ll see them here.
        </div>
      ) : (
        <ul className="divide-y rounded-md border bg-card">
          {leads.map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <Link
                  href={`/geo/leads/${l.id}?from=my-leads`}
                  className="font-medium hover:underline"
                >
                  {l.name}
                </Link>
                {l.company && (
                  <div className="text-xs text-muted-foreground truncate">
                    {l.company}
                  </div>
                )}
                {l.contact_phone && (
                  <a
                    href={`tel:${l.contact_phone}`}
                    className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    aria-label={`Call ${l.name} at ${l.contact_phone}`}
                  >
                    <Phone className="h-3 w-3" aria-hidden />
                    {l.contact_phone}
                  </a>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge
                  variant={stageBadgeVariant(l.stage)}
                  aria-label={`Stage: ${stageLabel(l.stage)}`}
                >
                  {stageLabel(l.stage)}
                </Badge>
                <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                  {formatDate(l.updated_at)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
