"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { stageLabel, type LeadStage } from "@/lib/geo/stages";

export interface LeadCardData {
  id: string;
  name: string;
  company: string | null;
  contact_phone: string | null;
  value_inr: number | null;
  assigned_to: string | null;
  assignee_name: string | null;
  stage: LeadStage;
}

export function LeadCard({
  lead,
  draggable,
}: {
  lead: LeadCardData;
  draggable?: boolean;
}) {
  return (
    <Link
      href={`/geo/leads/${lead.id}`}
      className={
        "block rounded-md border bg-card p-3 text-sm shadow-sm hover:border-primary transition-colors " +
        (draggable ? "cursor-grab active:cursor-grabbing" : "")
      }
    >
      <div className="font-medium leading-tight truncate">{lead.name}</div>
      {lead.company && (
        <div className="text-xs text-muted-foreground mt-0.5 truncate">{lead.company}</div>
      )}
      {lead.contact_phone && (
        <div className="text-xs text-muted-foreground mt-0.5">{lead.contact_phone}</div>
      )}
      {lead.value_inr !== null && lead.value_inr > 0 && (
        <div className="text-xs font-semibold mt-1">
          &#x20B9;{lead.value_inr.toLocaleString("en-IN")}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <Badge variant="secondary" className="text-[10px] shrink-0">
          {stageLabel(lead.stage)}
        </Badge>
        {lead.assignee_name ? (
          <span className="text-xs text-muted-foreground truncate max-w-[120px]">
            {lead.assignee_name}
          </span>
        ) : (
          <span className="text-xs italic text-amber-600">Unassigned</span>
        )}
      </div>
    </Link>
  );
}
