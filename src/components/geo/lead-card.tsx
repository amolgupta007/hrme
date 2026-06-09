"use client";

import Link from "next/link";
import { MessageCircle, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  stageBadgeVariant,
  stageLabel,
  type LeadStage,
} from "@/lib/geo/stages";
import { formatPhoneForWhatsApp } from "@/lib/geo/contact";

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
  const wa = formatPhoneForWhatsApp(lead.contact_phone);

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
        <div className="text-xs text-muted-foreground mt-0.5 truncate">
          {lead.company}
        </div>
      )}

      {/* Phone row — tap-to-dial + WhatsApp shortcut for field staff. The
          outer card is a <Link>, so phone links use stopPropagation to keep
          navigation predictable: tap the phone, dial the phone; tap the
          card body, open the lead. */}
      {lead.contact_phone && (
        <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <a
            href={`tel:${lead.contact_phone}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 hover:text-foreground"
            aria-label={`Call ${lead.name} at ${lead.contact_phone}`}
          >
            <Phone className="h-3 w-3" aria-hidden />
            {lead.contact_phone}
          </a>
          {wa && (
            <a
              href={`https://wa.me/${wa}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-0.5 rounded px-1 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50"
              aria-label={`Message ${lead.name} on WhatsApp`}
            >
              <MessageCircle className="h-3 w-3" aria-hidden />
              <span className="sr-only">WhatsApp</span>
            </a>
          )}
        </div>
      )}

      {lead.value_inr !== null && lead.value_inr > 0 && (
        <div className="text-xs font-semibold mt-1">
          &#x20B9;{lead.value_inr.toLocaleString("en-IN")}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <Badge
          variant={stageBadgeVariant(lead.stage)}
          aria-label={`Stage: ${stageLabel(lead.stage)}`}
          className="text-[10px] shrink-0"
        >
          {stageLabel(lead.stage)}
        </Badge>
        {lead.assignee_name ? (
          <span className="text-xs text-muted-foreground truncate max-w-[120px]">
            {lead.assignee_name}
          </span>
        ) : (
          <span className="text-xs italic text-amber-700">Unassigned</span>
        )}
      </div>
    </Link>
  );
}
