"use client";

import { useState } from "react";
import Link from "next/link";
import { LayoutGrid, List, MapPin, Plus } from "lucide-react";
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

  // First-run state. When the org has zero leads, the kanban-of-zeroes and
  // the "no leads match the current filters" copy both lie about what's
  // happening. PRODUCT.md is explicit: empty states explain what data goes
  // there. This swaps both for a single welcoming first-run surface — only
  // when the org genuinely has zero rows; filter-empty still falls through
  // to the per-view "no matches" copy.
  if (leads.length === 0) {
    return (
      <div className="mt-6 rounded-lg border border-dashed bg-muted/20 px-6 py-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <MapPin className="h-6 w-6" aria-hidden />
        </div>
        <h2 className="mt-4 text-lg font-semibold tracking-tight">
          Start your pipeline
        </h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Leads you log here become your sales pipeline. Drag them across
          stages, log visits from the field, and keep follow-ups on track —
          one place, one record per customer.
        </p>
        {canCreate ? (
          <Button
            size="sm"
            className="mt-5"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add your first lead
          </Button>
        ) : (
          <p className="mt-5 text-xs text-muted-foreground">
            Ask your admin or manager to add leads — once they do, anything
            assigned to you will show up here.
          </p>
        )}

        <LeadDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          mode="create"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-4">
      {/* Toolbar — flex-wrap so the count + count + button stack cleanly on
          narrow widths instead of overflowing. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border overflow-hidden">
          <Link
            href={toKanban}
            aria-label="Kanban view"
            aria-current={view === "kanban" ? "page" : undefined}
            className={
              "px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors " +
              (view === "kanban"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted")
            }
          >
            <LayoutGrid className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Kanban</span>
          </Link>
          <Link
            href={toList}
            aria-label="List view"
            aria-current={view === "list" ? "page" : undefined}
            className={
              "px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors " +
              (view === "list"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted")
            }
          >
            <List className="h-4 w-4" aria-hidden />
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
            <Plus className="h-4 w-4 mr-1" aria-hidden />
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

      <LeadDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode="create"
      />
    </div>
  );
}
