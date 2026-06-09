"use client";

import { Badge } from "@/components/ui/badge";
import { outcomeLabel, type LeadOutcome } from "@/lib/geo/stages";
import { Calendar, FileText } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface VisitRow {
  id: string;
  notes: string | null;
  outcome: LeadOutcome;
  follow_up_date: string | null;
  employee_name: string | null;
  source: "web" | "mobile";
  system: boolean;
  visited_at: string;
}

const OUTCOME_VARIANTS: Record<
  LeadOutcome,
  "default" | "secondary" | "destructive" | "outline"
> = {
  in_progress: "secondary",
  pending: "outline",
  follow_up: "outline",
  converted: "default",
  lost: "destructive",
};

export function VisitTimeline({ visits }: { visits: VisitRow[] }) {
  if (visits.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No visits logged yet. Use &quot;Log visit&quot; to record outcomes.
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {visits.map((v) => (
        <li
          key={v.id}
          className={
            "rounded border p-3 " +
            (v.system
              ? "bg-muted/30 border-dashed text-xs"
              : "bg-card")
          }
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              {v.system ? (
                <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              ) : (
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <span className="font-medium text-sm">
                {v.employee_name ?? "Unknown"}
              </span>
              <Badge
                variant={OUTCOME_VARIANTS[v.outcome]}
                className="text-[10px]"
              >
                {outcomeLabel(v.outcome)}
              </Badge>
              {v.system && (
                <span className="text-[10px] italic text-muted-foreground">
                  system
                </span>
              )}
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {formatDate(v.visited_at)}
            </span>
          </div>
          {v.notes && (
            <p className="text-sm mt-2 whitespace-pre-wrap">{v.notes}</p>
          )}
          {v.follow_up_date && (
            <p className="text-xs text-muted-foreground mt-1">
              Follow-up: {formatDate(v.follow_up_date)}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
