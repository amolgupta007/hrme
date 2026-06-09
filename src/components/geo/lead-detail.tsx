"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, MessageCircle, Pencil, Phone, Plus } from "lucide-react";
import {
  stageBadgeVariant,
  stageLabel,
  type LeadStage,
  type LeadOutcome,
} from "@/lib/geo/stages";
import { formatPhoneForWhatsApp } from "@/lib/geo/contact";
import { LogVisitDialog } from "./log-visit-dialog";
import { LeadDialog } from "./lead-dialog";
import { StageStepper } from "./stage-stepper";
import { VisitTimeline } from "./visit-timeline";

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

export interface LeadDetailProps {
  lead: {
    id: string;
    name: string;
    company: string | null;
    contact_phone: string | null;
    contact_email: string | null;
    address: string | null;
    value_inr: number | null;
    source: string | null;
    stage: LeadStage;
    assigned_to: string | null;
    created_at: string;
  };
  visits: VisitRow[];
  canEdit: boolean;
  canLogVisit: boolean;
  /** Name resolved server-side from `lead.assigned_to`; null when unassigned. */
  assigneeName: string | null;
}

export function LeadDetail({
  lead,
  visits,
  canEdit,
  canLogVisit,
  assigneeName,
}: LeadDetailProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [visitOpen, setVisitOpen] = useState(false);

  const wa = formatPhoneForWhatsApp(lead.contact_phone);

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* Left: lead info */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base font-semibold">
              Lead details
            </CardTitle>
            <Badge
              variant={stageBadgeVariant(lead.stage)}
              aria-label={`Stage: ${stageLabel(lead.stage)}`}
            >
              {stageLabel(lead.stage)}
            </Badge>
          </div>
          {canEdit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditOpen(true)}
              className="shrink-0"
            >
              <Pencil className="h-3.5 w-3.5 mr-1" />
              Edit
            </Button>
          )}
        </CardHeader>

        <CardContent className="space-y-3 text-sm">
          {/* Inline stage stepper. Keeps the operator in the detail surface
              instead of round-tripping through the kanban or the Edit
              dialog to flip a stage. Disabled when the caller can't edit. */}
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Stage</div>
            <StageStepper
              leadId={lead.id}
              current={lead.stage}
              leadName={lead.name}
              disabled={!canEdit}
            />
          </div>

          {lead.contact_phone && (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Phone</div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={`tel:${lead.contact_phone}`}
                  className="inline-flex items-center gap-1.5 text-foreground hover:text-primary"
                  aria-label={`Call ${lead.name} at ${lead.contact_phone}`}
                >
                  <Phone className="h-3.5 w-3.5" aria-hidden />
                  {lead.contact_phone}
                </a>
                {wa && (
                  <a
                    href={`https://wa.me/${wa}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                    aria-label={`Message ${lead.name} on WhatsApp`}
                  >
                    <MessageCircle className="h-3 w-3" aria-hidden />
                    WhatsApp
                  </a>
                )}
              </div>
            </div>
          )}

          {lead.contact_email && (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Email</div>
              <a
                href={`mailto:${lead.contact_email}`}
                className="inline-flex items-center gap-1.5 text-foreground hover:text-primary"
                aria-label={`Email ${lead.name} at ${lead.contact_email}`}
              >
                <Mail className="h-3.5 w-3.5" aria-hidden />
                {lead.contact_email}
              </a>
            </div>
          )}

          {lead.address && (
            <InfoRow label="Address" value={lead.address} />
          )}
          {/* Hide ₹0 to match the card and list (unset is the default). */}
          {lead.value_inr !== null && lead.value_inr > 0 && (
            <InfoRow
              label="Estimated value"
              value={`₹${lead.value_inr.toLocaleString("en-IN")}`}
            />
          )}
          {lead.source && (
            <InfoRow label="Source" value={lead.source} />
          )}
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Assigned to</div>
            <div>
              {assigneeName ?? (
                <span className="italic text-amber-700">Unassigned</span>
              )}
            </div>
          </div>
          <InfoRow
            label="Created"
            value={new Date(lead.created_at).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          />
        </CardContent>
      </Card>

      {/* Right: visit timeline */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-lg">Visit timeline</CardTitle>
          {canLogVisit && (
            <Button size="sm" onClick={() => setVisitOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Log visit
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <VisitTimeline visits={visits} />
        </CardContent>
      </Card>

      {/* Dialogs */}
      <LeadDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        lead={lead}
      />
      <LogVisitDialog
        open={visitOpen}
        onOpenChange={setVisitOpen}
        leadId={lead.id}
      />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div>{value}</div>
    </div>
  );
}
