import Link from "next/link";
import { formatDate } from "@/lib/utils";

interface OverdueRow {
  lead_id: string;
  lead_name: string;
  assignee_name: string | null;
  follow_up_date: string;
  days_overdue: number;
}

interface OverdueFollowUpsProps {
  rows: OverdueRow[];
}

export function OverdueFollowUps({ rows }: OverdueFollowUpsProps) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No overdue follow-ups. 🎉
      </p>
    );
  }

  return (
    <ul className="divide-y">
      {rows.map((r) => (
        <li key={r.lead_id} className="py-3 flex items-start justify-between gap-3">
          <div>
            <Link
              href={`/geo/leads/${r.lead_id}`}
              className="font-medium hover:underline"
            >
              {r.lead_name}
            </Link>
            <div className="text-xs text-muted-foreground">
              Assignee: {r.assignee_name ?? "Unassigned"} · Due{" "}
              {formatDate(r.follow_up_date)}
            </div>
          </div>
          <span className="text-xs font-semibold text-destructive whitespace-nowrap">
            {r.days_overdue} day{r.days_overdue === 1 ? "" : "s"} overdue
          </span>
        </li>
      ))}
    </ul>
  );
}
