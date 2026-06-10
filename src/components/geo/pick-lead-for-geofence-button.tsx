"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddGeofenceDialog } from "./add-geofence-dialog";
import {
  PickLeadForGeofenceDialog,
  type LeadSlot,
} from "./pick-lead-for-geofence-dialog";

interface PickLeadForGeofenceButtonProps {
  enabled: boolean;
  leads: LeadSlot[];
}

/**
 * Two-stage flow: (1) admin clicks the button, picker dialog opens with
 * the org's leads; (2) on pick, picker closes and AddGeofenceDialog
 * opens in lead-preset with the selected lead pre-filled. Used as the
 * GeoPageHeader rightSlot on /geo/geofences alongside <AddGeofenceButton>
 * (which handles the address path).
 */
export function PickLeadForGeofenceButton({
  enabled,
  leads,
}: PickLeadForGeofenceButtonProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [picked, setPicked] = useState<LeadSlot | null>(null);

  if (!enabled) return null;

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setPickerOpen(true)}
      >
        <Users className="h-4 w-4 mr-1" aria-hidden />
        From a lead
      </Button>

      <PickLeadForGeofenceDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        leads={leads}
        onPick={(lead) => {
          setPicked(lead);
          setPickerOpen(false);
        }}
      />

      {picked && (
        <AddGeofenceDialog
          open={picked !== null}
          onOpenChange={(o) => {
            if (!o) setPicked(null);
          }}
          preset={{
            type: "lead",
            leadId: picked.id,
            leadName: picked.name,
            leadCompany: picked.company,
          }}
        />
      )}
    </>
  );
}
