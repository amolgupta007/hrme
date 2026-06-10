"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CalendarPlus,
  Mail,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
} from "lucide-react";
import {
  stageBadgeVariant,
  stageLabel,
  type LeadStage,
  type LeadOutcome,
} from "@/lib/geo/stages";
import { formatPhoneForWhatsApp } from "@/lib/geo/contact";
import { formatDate, formatRelativeDay } from "@/lib/utils";
import { LogVisitDialog } from "./log-visit-dialog";
import { LeadDialog } from "./lead-dialog";
import { ScheduleFollowupDialog } from "./schedule-followup-dialog";
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
  /**
   * canEdit and canLogVisit are kept as distinct booleans even though they
   * always evaluate equally today (manager+ OR assigned-to-me). Phase 2's
   * mobile app will let a field employee log a visit on a lead without
   * editing its details, so the split is the contract we want to preserve.
   * Internally we collapse to a single `canAct` for terse render gates.
   */
  canEdit: boolean;
  canLogVisit: boolean;
  /** Name resolved server-side from `lead.assigned_to`; null when unassigned. */
  assigneeName: string | null;
  /** True when the visits server fetch failed; passed through to the timeline. */
  visitsError?: boolean;
  /** Controlled dialog state, owned by the LeadDetailShell so page-level
   *  CTAs, the mobile sticky bar, and keyboard shortcuts can all open the
   *  same dialog instance. */
  editOpen: boolean;
  onEditOpenChange: (open: boolean) => void;
  logVisitOpen: boolean;
  onLogVisitOpenChange: (open: boolean) => void;
}

interface NextFollowUp {
  date: string;
  employeeName: string | null;
}

/** Finds the soonest future follow-up across all logged visits. */
function findNextFollowUp(visits: VisitRow[]): NextFollowUp | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let best: { row: VisitRow; t: number } | null = null;
  for (const v of visits) {
    if (!v.follow_up_date) continue;
    const d = new Date(v.follow_up_date);
    d.setHours(0, 0, 0, 0);
    const t = d.getTime();
    if (t < today.getTime()) continue;
    if (!best || t < best.t) best = { row: v, t };
  }
  if (!best) return null;
  return { date: best.row.follow_up_date!, employeeName: best.row.employee_name };
}

export function LeadDetail({
  lead,
  visits,
  canEdit,
  canLogVisit,
  assigneeName,
  visitsError,
  editOpen,
  onEditOpenChange,
  logVisitOpen,
  onLogVisitOpenChange,
}: LeadDetailProps) {
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const wa = formatPhoneForWhatsApp(lead.contact_phone);
  const nextFollowUp = useMemo(() => findNextFollowUp(visits), [visits]);
  const mapsUrl = lead.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        lead.address,
      )}`
    : null;

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
              onClick={() => onEditOpenChange(true)}
              className="shrink-0"
              aria-keyshortcuts="e"
            >
              <Pencil className="h-4 w-4 mr-1" aria-hidden />
              Edit
            </Button>
          )}
        </CardHeader>

        <CardContent className="space-y-3 text-sm">
          {/* Inline stage stepper. Keeps the operator in the detail surface
              instead of round-tripping through the kanban or the Edit
              dialog to flip a stage. Disabled when the caller can't edit.
              Terminal-stage capture happens inside the stepper. */}
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Stage</div>
            <StageStepper
              leadId={lead.id}
              current={lead.stage}
              leadName={lead.name}
              currentValueInr={lead.value_inr}
              disabled={!canEdit}
            />
          </div>

          {/* Next action row. The whole page is built around the operator's
              foreground question — "when do I follow up?" — so we answer
              it explicitly instead of burying the answer in the timeline. */}
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Next follow-up</div>
            {nextFollowUp ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-medium">
                  {formatDate(nextFollowUp.date)}
                </span>
                <span className="text-xs text-muted-foreground">
                  · {formatRelativeDay(nextFollowUp.date)}
                </span>
                {nextFollowUp.employeeName && (
                  <span className="text-xs text-muted-foreground">
                    · {nextFollowUp.employeeName}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-muted-foreground italic">
                  No follow-up scheduled
                </span>
                {canLogVisit && (
                  <button
                    type="button"
                    onClick={() => setScheduleOpen(true)}
                    className="inline-flex items-center gap-1 rounded-md text-xs font-medium text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                  >
                    <CalendarPlus className="h-3.5 w-3.5" aria-hidden />
                    Schedule one
                  </button>
                )}
              </div>
            )}
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

          {lead.address && mapsUrl && (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Address</div>
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-start gap-1.5 text-foreground hover:text-primary"
                aria-label={`Open address for ${lead.name} in Google Maps`}
              >
                <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden />
                <span className="underline-offset-2 hover:underline">
                  {lead.address}
                </span>
              </a>
            </div>
          )}

          {/* Hide ₹0 to match the card and list (unset is the default). */}
          {lead.value_inr !== null && lead.value_inr > 0 && (
            <InfoRow
              label="Estimated value"
              value={`₹${lead.value_inr.toLocaleString("en-IN")}`}
            />
          )}
          {lead.source && <InfoRow label="Source" value={lead.source} />}
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
            <Button
              size="sm"
              onClick={() => onLogVisitOpenChange(true)}
              aria-keyshortcuts="v"
            >
              <Plus className="h-4 w-4 mr-1" aria-hidden />
              Log visit
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <VisitTimeline visits={visits} error={visitsError} />
        </CardContent>
      </Card>

      {/* Dialogs */}
      <LeadDialog
        open={editOpen}
        onOpenChange={onEditOpenChange}
        mode="edit"
        lead={lead}
      />
      <LogVisitDialog
        open={logVisitOpen}
        onOpenChange={onLogVisitOpenChange}
        leadId={lead.id}
      />
      <ScheduleFollowupDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        leadId={lead.id}
        leadName={lead.name}
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
