"use client";

import { useState } from "react";
import { MapPin, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export interface LeadSlot {
  id: string;
  name: string;
  company: string | null;
  address: string | null;
  /** True when the lead has stored lat/lng (the geofence creation skips
   *  the on-demand geocode and uses the cached coords). */
  has_coords: boolean;
}

interface PickLeadForGeofenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leads: LeadSlot[];
  /** Fired when the admin clicks a usable lead. The parent component
   *  closes this dialog and opens the geofence-create flow with the
   *  selected lead pre-filled. */
  onPick: (lead: LeadSlot) => void;
}

/**
 * Searchable picker for the "Create geofence from a lead" flow on
 * /geo/geofences. Leads without stored coords AND without an address
 * are dimmed and non-selectable — there's nothing to anchor a fence
 * to. The next step (AddGeofenceDialog in lead preset) handles the
 * name/type/radius confirmation.
 */
export function PickLeadForGeofenceDialog({
  open,
  onOpenChange,
  leads,
  onPick,
}: PickLeadForGeofenceDialogProps) {
  const [query, setQuery] = useState("");

  const filtered = leads.filter((l) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    if (l.name.toLowerCase().includes(q)) return true;
    if (l.company?.toLowerCase().includes(q)) return true;
    if (l.address?.toLowerCase().includes(q)) return true;
    return false;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pick a lead</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, company, or address"
            className="pl-8"
            autoFocus
          />
        </div>

        <div className="max-h-[360px] overflow-y-auto rounded-md border bg-card scroll-thin">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {leads.length === 0
                ? "No leads in your scope yet. Create one from /geo/leads first."
                : "No leads match that search."}
            </p>
          ) : (
            <ul className="divide-y">
              {filtered.map((l) => {
                const usable = l.has_coords || !!l.address;
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => usable && onPick(l)}
                      disabled={!usable}
                      className="w-full px-3 py-2.5 text-left text-sm hover:bg-muted disabled:opacity-50 disabled:hover:bg-transparent focus:outline-none focus:bg-muted"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{l.name}</div>
                          {l.company && (
                            <div className="text-xs text-muted-foreground truncate">
                              {l.company}
                            </div>
                          )}
                          {l.address && (
                            <div className="mt-0.5 inline-flex items-start gap-1 text-xs text-muted-foreground">
                              <MapPin
                                className="mt-0.5 h-3 w-3 shrink-0"
                                aria-hidden
                              />
                              <span className="truncate">{l.address}</span>
                            </div>
                          )}
                        </div>
                        {!usable && (
                          <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                            No location
                          </span>
                        )}
                        {usable && l.has_coords && (
                          <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            Geocoded
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Leads without a usable location are dimmed — add an address on
          the lead detail page first.
        </p>
      </DialogContent>
    </Dialog>
  );
}
