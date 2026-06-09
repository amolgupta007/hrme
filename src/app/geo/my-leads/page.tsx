import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireJambaGeoAccess } from "@/lib/jambageo-access";
import { getMyAssignedLeads } from "@/actions/geo-reports";
import { stageLabel } from "@/lib/geo/stages";
import Link from "next/link";
import { formatDate } from "@/lib/utils";

export default async function MyLeadsPage() {
  await requireJambaGeoAccess();
  const res = await getMyAssignedLeads();
  const leads = res.success ? res.data : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>My assigned leads</CardTitle>
      </CardHeader>
      <CardContent>
        {leads.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You don&apos;t have any leads assigned yet. Your manager will assign leads here.
          </p>
        ) : (
          <ul className="divide-y">
            {leads.map(l => (
              <li key={l.id} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <Link href={`/geo/leads/${l.id}`} className="font-medium hover:underline">
                    {l.name}
                  </Link>
                  {l.company && (
                    <div className="text-xs text-muted-foreground">{l.company}</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{stageLabel(l.stage)}</Badge>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(l.updated_at)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
