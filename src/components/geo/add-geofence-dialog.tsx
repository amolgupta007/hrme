"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { MapPin, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createGeofence,
  createGeofenceFromLead,
  geocodeGeofenceAddress,
} from "@/actions/geo-geofences";

interface AddressPreset {
  type: "address";
}

interface LeadPreset {
  type: "lead";
  leadId: string;
  /** Used to pre-fill the geofence name; admin can edit before save. */
  leadName: string;
  /** Optional company string used to compose the default name. */
  leadCompany?: string | null;
}

export type AddGeofencePreset = AddressPreset | LeadPreset;

interface AddGeofenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preset: AddGeofencePreset;
}

/**
 * Unified "Add geofence" dialog. Two presets:
 *
 * - `address`: free-text address input → Mapbox forward-geocode → confirm
 *   the resolved place name + name + type + radius → save. Used by the
 *   "Add geofence" button on /geo/geofences.
 *
 * - `lead`: the dialog opens with a specific lead already in scope —
 *   typically launched from the lead detail page. Name pre-fills from
 *   "Lead (Company)"; type defaults to "client"; coordinates come from
 *   the lead's stored lat/lng (or the action geocodes its address on
 *   demand). Used by the "Create geofence here" button on
 *   /geo/leads/[id].
 *
 * Both paths land in geofences-table-shaped rows via the existing
 * createGeofence / createGeofenceFromLead actions.
 */
export function AddGeofenceDialog({
  open,
  onOpenChange,
  preset,
}: AddGeofenceDialogProps) {
  const [pending, startTransition] = useTransition();

  // Shared form fields
  const [name, setName] = useState("");
  const [type, setType] = useState<"client" | "office">("client");
  const [radius, setRadius] = useState<number>(200);

  // Address-mode state
  const [addressQuery, setAddressQuery] = useState("");
  const [geocoded, setGeocoded] = useState<{
    lat: number;
    lng: number;
    place_name: string;
  } | null>(null);
  const [geocoding, setGeocoding] = useState(false);

  // Reset every field whenever the dialog opens fresh.
  useEffect(() => {
    if (!open) return;
    setName(
      preset.type === "lead"
        ? preset.leadCompany
          ? `${preset.leadName} (${preset.leadCompany})`
          : preset.leadName
        : "",
    );
    setType(preset.type === "lead" ? "client" : "client");
    setRadius(200);
    setAddressQuery("");
    setGeocoded(null);
    setGeocoding(false);
  }, [open, preset]);

  function runGeocode() {
    const q = addressQuery.trim();
    if (!q) {
      toast.error("Type an address first.");
      return;
    }
    setGeocoding(true);
    startTransition(async () => {
      const res = await geocodeGeofenceAddress(q);
      setGeocoding(false);
      if (res.success) {
        setGeocoded({
          lat: res.data.lat,
          lng: res.data.lng,
          place_name: res.data.place_name,
        });
        // Seed a default name from the matched place if blank.
        setName((prev) => prev || res.data.place_name.split(",")[0]);
      } else {
        setGeocoded(null);
        toast.error(res.error);
      }
    });
  }

  function save() {
    if (!name.trim()) {
      toast.error("Geofence needs a name.");
      return;
    }

    startTransition(async () => {
      if (preset.type === "lead") {
        const res = await createGeofenceFromLead({
          lead_id: preset.leadId,
          name: name.trim(),
          type,
          radius_m: radius,
        });
        if (res.success) {
          toast.success(`Geofence "${res.data.name}" created at the lead's location.`);
          onOpenChange(false);
        } else {
          toast.error(res.error);
        }
        return;
      }

      // Address path
      if (!geocoded) {
        toast.error("Geocode the address first by clicking Find.");
        return;
      }
      const res = await createGeofence({
        name: name.trim(),
        type,
        center_lat: geocoded.lat,
        center_lng: geocoded.lng,
        radius_m: radius,
      });
      if (res.success) {
        toast.success(`Geofence "${res.data.name}" created.`);
        onOpenChange(false);
      } else {
        toast.error(res.error);
      }
    });
  }

  const title =
    preset.type === "lead"
      ? "Create geofence at this lead"
      : "Add geofence by address";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 py-1">
          {preset.type === "address" && (
            <>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Address or place
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={addressQuery}
                    onChange={(e) => setAddressQuery(e.target.value)}
                    placeholder="e.g. Andheri MIDC, Mumbai"
                    disabled={pending || geocoding}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        runGeocode();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={runGeocode}
                    disabled={pending || geocoding || !addressQuery.trim()}
                  >
                    <Search className="h-3.5 w-3.5 mr-1" aria-hidden />
                    Find
                  </Button>
                </div>
              </div>

              {geocoded && (
                <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 p-2.5 text-xs">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                  <div className="space-y-0.5">
                    <p className="font-medium text-foreground">
                      {geocoded.place_name}
                    </p>
                    <p className="text-muted-foreground tabular-nums">
                      {geocoded.lat.toFixed(5)}, {geocoded.lng.toFixed(5)}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          {preset.type === "lead" && (
            <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 p-2.5 text-xs">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
              <div className="space-y-0.5">
                <p className="font-medium text-foreground">
                  Lead: {preset.leadName}
                </p>
                <p className="text-muted-foreground">
                  Uses this lead&apos;s stored coordinates (geocoded from
                  the address if needed).
                </p>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Geofence name
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Andheri Office"
              disabled={pending}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as "client" | "office")}
                disabled={pending}
              >
                <SelectTrigger aria-label="Geofence type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Client site</SelectItem>
                  <SelectItem value="office">Office</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Radius (m)
              </Label>
              <Input
                type="number"
                min={1}
                max={5000}
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value) || 0)}
                disabled={pending}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={
              pending ||
              !name.trim() ||
              (preset.type === "address" && !geocoded) ||
              radius < 1
            }
          >
            {preset.type === "lead" ? "Create geofence" : "Save geofence"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
