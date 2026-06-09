"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Pencil, Plus } from "lucide-react";
import { stageLabel, type LeadStage, type LeadOutcome } from "@/lib/geo/stages";
import { LogVisitDialog } from "./log-visit-dialog";
import { LeadDialog } from "./lead-dialog";
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
}

export function LeadDetail({ lead, visits, canEdit, canLogVisit }: LeadDetailProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [visitOpen, setVisitOpen] = useState(false);

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* Left: lead info */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-lg">{lead.name}</CardTitle>
            {lead.company && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {lead.company}
              </p>
            )}
            <Badge variant="secondary" className="mt-2">
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
          {lead.contact_phone && (
            <InfoRow label="Phone" value={lead.contact_phone} />
          )}
          {lead.contact_email && (
            <InfoRow label="Email" value={lead.contact_email} />
          )}
          {lead.address && (
            <InfoRow label="Address" value={lead.address} />
          )}
          {lead.value_inr !== null && (
            <InfoRow
              label="Estimated value"
              value={`₹${lead.value_inr.toLocaleString("en-IN")}`}
            />
          )}
          {lead.source && (
            <InfoRow label="Source" value={lead.source} />
          )}
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
