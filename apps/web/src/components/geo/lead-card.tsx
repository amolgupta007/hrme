"use client";

import Link from "next/link";
import { Phone } from "lucide-react";
import type { LeadStage } from "@/lib/geo/stages";

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

/**
 * Kanban-only lead card. Deliberately trimmed for density:
 *
 * - **No stage chip** — the column IS the stage signal; rendering it on
 *   the card too is double-encoding.
 * - **No WhatsApp pivot** — kanban is a triage surface (where does this
 *   belong?), not an action surface (who do I call?). WhatsApp earns its
 *   place on the detail page and the mobile sticky bar, both one click
 *   away.
 * - **Tighter padding** (p-2.5 vs p-3) and a compact bottom row that
 *   packs value + assignee into a single line.
 *
 * Three visible rows max: name → company / phone → value · assignee.
 */
export function LeadCard({
  lead,
  draggable,
}: {
  lead: LeadCardData;
  draggable?: boolean;
}) {
  const hasValue = lead.value_inr !== null && lead.value_inr > 0;

  return (
    <Link
      href={`/geo/leads/${lead.id}`}
      className={
        "block rounded-md border bg-card p-2.5 text-sm shadow-sm hover:border-primary transition-colors " +
        (draggable ? "cursor-grab active:cursor-grabbing" : "")
      }
    >
      <div className="font-medium leading-tight truncate">{lead.name}</div>

      {lead.company && (
        <div className="mt-0.5 text-xs text-muted-foreground truncate">
          {lead.company}
        </div>
      )}

      {lead.contact_phone && (
        <a
          href={`tel:${lead.contact_phone}`}
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          aria-label={`Call ${lead.name} at ${lead.contact_phone}`}
        >
          <Phone className="h-3 w-3" aria-hidden />
          {lead.contact_phone}
        </a>
      )}

      {(hasValue || lead.assignee_name || !lead.assigned_to) && (
        <div className="mt-1.5 flex items-center justify-between gap-2 text-xs">
          {hasValue ? (
            <span className="font-semibold text-foreground tabular-nums">
              &#x20B9;{lead.value_inr!.toLocaleString("en-IN")}
            </span>
          ) : (
            <span />
          )}
          {lead.assignee_name ? (
            <span className="truncate max-w-[140px] text-muted-foreground">
              {lead.assignee_name}
            </span>
          ) : (
            <span className="italic text-amber-700">Unassigned</span>
          )}
        </div>
      )}
    </Link>
  );
}
