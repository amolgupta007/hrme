"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LeadDetail, type LeadDetailProps } from "./lead-detail";
import { LeadMobileActions } from "./lead-mobile-actions";
import { LeadPageNav } from "./lead-page-nav";
import { LeadShortcuts } from "./lead-shortcuts";

interface SiblingLead {
  id: string;
  name: string;
}

interface LeadDetailShellProps {
  lead: LeadDetailProps["lead"];
  visits: LeadDetailProps["visits"];
  canEdit: boolean;
  canLogVisit: boolean;
  assigneeName: string | null;
  visitsError?: boolean;
  prev: SiblingLead | null;
  next: SiblingLead | null;
  position?: { index: number; total: number };
}

/**
 * Client shell that owns the dialog state for the lead detail surface.
 *
 * The page (server) fetches data and hands it down; this component hosts
 * the open/close booleans for Edit and Log Visit so all four entry points
 * — the inline card-header buttons, the page-level h1 row, the mobile
 * sticky-bottom bar, and the keyboard shortcuts — open the same dialog
 * instance. Without state lifting, each entry point would need its own
 * imperative handle or its own custom event.
 *
 * LeadPageNav is rendered here (rather than in the page) so the keyboard
 * shortcut listener has the prev/next refs in scope without prop-
 * drilling through LeadDetail.
 */
export function LeadDetailShell({
  lead,
  visits,
  canEdit,
  canLogVisit,
  assigneeName,
  visitsError,
  prev,
  next,
  position,
}: LeadDetailShellProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [logVisitOpen, setLogVisitOpen] = useState(false);

  return (
    <>
      {/* Page-level action row — promotes Log Visit to a primary slot at
          the top on desktop. Hidden on mobile in favour of the sticky
          bottom bar (which lives at the bottom of this component). */}
      {canLogVisit && (
        <div className="mb-3 hidden md:flex items-center justify-end gap-2">
          <Button
            onClick={() => setLogVisitOpen(true)}
            aria-keyshortcuts="v"
          >
            <Plus className="h-4 w-4 mr-1" aria-hidden />
            Log visit
          </Button>
        </div>
      )}

      <LeadPageNav prev={prev} next={next} position={position} />

      <LeadDetail
        lead={lead}
        visits={visits}
        canEdit={canEdit}
        canLogVisit={canLogVisit}
        assigneeName={assigneeName}
        visitsError={visitsError}
        editOpen={editOpen}
        onEditOpenChange={setEditOpen}
        logVisitOpen={logVisitOpen}
        onLogVisitOpenChange={setLogVisitOpen}
      />

      {/* Bottom spacer so the mobile sticky action bar doesn't cover the
          last row of the visit timeline. Hidden on md+ where the bar is. */}
      {canLogVisit && <div className="h-20 md:hidden" aria-hidden />}

      <LeadMobileActions
        leadName={lead.name}
        phone={lead.contact_phone}
        onLogVisit={() => setLogVisitOpen(true)}
        enabled={canLogVisit}
      />

      <LeadShortcuts
        prev={prev}
        next={next}
        onEdit={() => setEditOpen(true)}
        onLogVisit={() => setLogVisitOpen(true)}
        enabled={canEdit || canLogVisit}
      />
    </>
  );
}
