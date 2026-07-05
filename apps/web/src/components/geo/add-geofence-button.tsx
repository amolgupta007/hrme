"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddGeofenceDialog } from "./add-geofence-dialog";

interface AddGeofenceButtonProps {
  /** When false (e.g. non-admin viewer), the button doesn't render. */
  enabled: boolean;
}

/**
 * Page-level "Add geofence" affordance for /geo/geofences. Owns the dialog
 * state and opens the address-based flow. The map's Mapbox draw control
 * remains the alternative "drop on map" path; the inline help on the page
 * also surfaces the "Create geofence here" entry point from each lead
 * detail page.
 */
export function AddGeofenceButton({ enabled }: AddGeofenceButtonProps) {
  const [open, setOpen] = useState(false);
  if (!enabled) return null;
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-1" aria-hidden />
        Add geofence
      </Button>
      <AddGeofenceDialog
        open={open}
        onOpenChange={setOpen}
        preset={{ type: "address" }}
      />
    </>
  );
}
