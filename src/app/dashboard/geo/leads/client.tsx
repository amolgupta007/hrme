"use client";

import { useState } from "react";
import Link from "next/link";
import { LayoutGrid, List, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LeadsKanban } from "@/components/geo/leads-kanban";
import { LeadsList } from "@/components/geo/leads-list";
import { LeadDialog } from "@/components/geo/lead-dialog";
import type { LeadCardData } from "@/components/geo/lead-card";

interface Props {
  leads: LeadCardData[];
  view: "kanban" | "list";
  canCreate: boolean;
  canDrag: boolean;
}

export function LeadsPageClient({ leads, view, canCreate, canDrag }: Props) {
const [dialogOpen, setDialogOpen] = useState(false);

  // Build toggle URLs preserving other search params
  const toKanban = "?view=kanban";
  const toList = "?view=list";

  return (
    <div className="space-y-4 mt-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="flex rounded-md border overflow-hidden">
          <Link
            href={toKanban}
            aria-label="Kanban view"
            className={
              "px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors " +
              (view === "kanban"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted")
            }
          >
            <LayoutGrid className="h-4 w-4" />
            <span className="hidden sm:inline">Kanban</span>
          </Link>
          <Link
            href={toList}
            aria-label="List view"
            className={
              "px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors " +
              (view === "list"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted")
            }
          >
            <List className="h-4 w-4" />
            <span className="hidden sm:inline">List</span>
          </Link>
        </div>

        <span className="text-sm text-muted-foreground">
          {leads.length} lead{leads.length !== 1 ? "s" : ""}
        </span>

        {canCreate && (
          <Button
            size="sm"
            className="ml-auto"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            New Lead
          </Button>
        )}
      </div>

      {/* View */}
      {view === "list" ? (
        <LeadsList leads={leads} />
      ) : (
        <LeadsKanban leads={leads} canDrag={canDrag} />
      )}

      {/* Create dialog (stub — Task 13 ships real implementation) */}
      <LeadDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode="create"
      />
    </div>
  );
}
