"use client";

import * as React from "react";
import { toast } from "sonner";
import { MapPin, Search, Crosshair, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  updateLocationPunchSettings,
  setLocationGeofence,
  geocodeLocationAddress,
  type GeofencedLocationRow,
} from "@/actions/location-punch";
import {
  MIN_GEOFENCE_RADIUS_M,
  MAX_GEOFENCE_RADIUS_M,
  type LocationPunchSettings,
} from "@jambahr/shared/attendance/geo-punch";

interface Props {
  settings: LocationPunchSettings;
  locations: GeofencedLocationRow[];
}

/**
 * Settings → Attendance → Location-verified clock-in.
 *
 * Named for what the owner buys — verification — not for the mechanism. Copy
 * throughout avoids the word "tracking": this captures one point-in-time fix at
 * the moment of a punch, not a continuous trail (which is JambaGeo's job, and a
 * materially different DPDP posture).
 */
export function LocationPunchCard({ settings, locations }: Props) {
  const [enabled, setEnabled] = React.useState(settings.enabled);
  const [mode, setMode] = React.useState(settings.mode);
  const [radius, setRadius] = React.useState(String(settings.defaultRadiusM));
  const [saving, setSaving] = React.useState(false);
  const [sites, setSites] = React.useState(locations);
  const [editingId, setEditingId] = React.useState<string | null>(null);

  const pinnedCount = sites.filter((s) => s.lat !== null && s.is_active).length;

  async function handleSave() {
    const radiusM = Number(radius);
    if (!Number.isInteger(radiusM) || radiusM < MIN_GEOFENCE_RADIUS_M || radiusM > MAX_GEOFENCE_RADIUS_M) {
      toast.error(`Radius must be a whole number between ${MIN_GEOFENCE_RADIUS_M}m and ${MAX_GEOFENCE_RADIUS_M}m`);
      return;
    }
    setSaving(true);
    const r = await updateLocationPunchSettings({ enabled, mode, defaultRadiusM: radiusM });
    setSaving(false);
    if (!r.success) {
      toast.error(r.error);
      return;
    }
    toast.success("Location settings saved");
  }

  function onSiteSaved(row: GeofencedLocationRow) {
    setSites((prev) => prev.map((s) => (s.id === row.id ? row : s)));
    setEditingId(null);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="rounded-lg bg-primary/10 p-2 shrink-0">
          <MapPin className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold">Location-verified clock-in</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tags each mobile punch as being at one of your offices, or remote from a named
            locality. Off by default.
          </p>
        </div>
      </div>

      <label className="flex items-center justify-between text-sm gap-4">
        <span>
          <span className="font-medium">Enable location verification</span>
          <span className="block text-xs text-muted-foreground mt-0.5">
            The app asks staff for location permission once, and records a single position at
            the moment they punch. It never tracks them in the background.
          </span>
        </span>
        <input
          type="checkbox"
          className="h-4 w-4 shrink-0"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
      </label>

      {enabled && (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="text-sm">
            <p className="font-medium mb-1.5">If location isn&apos;t available</p>
            <div className="space-y-1.5">
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="location-punch-mode"
                  className="mt-1"
                  checked={mode === "optional"}
                  onChange={() => setMode("optional")}
                />
                <span>
                  <span className="font-medium">Record the punch anyway</span>
                  <span className="block text-xs text-muted-foreground">
                    Recommended. A denied permission or a failed GPS fix leaves the punch
                    untagged rather than blocking it.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="location-punch-mode"
                  className="mt-1"
                  checked={mode === "required"}
                  onChange={() => setMode("required")}
                />
                <span>
                  <span className="font-medium">Block the punch</span>
                  <span className="block text-xs text-muted-foreground">
                    Staff cannot clock in without location. Be deliberate: any GPS failure
                    becomes a can&apos;t-clock-in call to you.
                  </span>
                </span>
              </label>
            </div>
          </div>

          <label className="flex items-center justify-between text-sm gap-4">
            <span>
              <span className="font-medium">Default office radius</span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                How close to an office counts as being at it. Individual sites can override this.
              </span>
            </span>
            <span className="flex items-center gap-1.5 shrink-0">
              <input
                type="number"
                min={MIN_GEOFENCE_RADIUS_M}
                max={MAX_GEOFENCE_RADIUS_M}
                step={25}
                value={radius}
                onChange={(e) => setRadius(e.target.value)}
                className="h-8 w-24 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <span className="text-sm text-muted-foreground">m</span>
            </span>
          </label>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Office locations</p>
              <span className="text-xs text-muted-foreground">
                {pinnedCount} of {sites.filter((s) => s.is_active).length} pinned
              </span>
            </div>

            {sites.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                No locations yet. Add them under{" "}
                <span className="font-medium">Biometric Devices → Locations</span>, then pin each
                one here.
              </p>
            ) : (
              <>
                {pinnedCount === 0 && (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    No office is pinned yet, so punches stay <strong>untagged</strong> — nobody
                    is marked remote until you set at least one location.
                  </p>
                )}
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {sites.map((site) => (
                    <SiteRow
                      key={site.id}
                      site={site}
                      defaultRadiusM={Number(radius) || settings.defaultRadiusM}
                      editing={editingId === site.id}
                      onEdit={() => setEditingId(site.id)}
                      onCancel={() => setEditingId(null)}
                      onSaved={onSiteSaved}
                    />
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-end pt-1">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function SiteRow({
  site,
  defaultRadiusM,
  editing,
  onEdit,
  onCancel,
  onSaved,
}: {
  site: GeofencedLocationRow;
  defaultRadiusM: number;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSaved: (row: GeofencedLocationRow) => void;
}) {
  const [lat, setLat] = React.useState(site.lat === null ? "" : String(site.lat));
  const [lng, setLng] = React.useState(site.lng === null ? "" : String(site.lng));
  const [radius, setRadius] = React.useState(
    site.geofence_radius_m === null ? "" : String(site.geofence_radius_m),
  );
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!editing) {
      setLat(site.lat === null ? "" : String(site.lat));
      setLng(site.lng === null ? "" : String(site.lng));
      setRadius(site.geofence_radius_m === null ? "" : String(site.geofence_radius_m));
    }
  }, [editing, site]);

  async function findFromAddress() {
    if (!site.address) {
      toast.error("This location has no address. Enter coordinates directly.");
      return;
    }
    setBusy(true);
    const r = await geocodeLocationAddress(site.address);
    setBusy(false);
    if (!r.success) {
      toast.error(r.error);
      return;
    }
    setLat(String(r.data.lat));
    setLng(String(r.data.lng));
    toast.success(`Found: ${r.data.placeName}`);
  }

  async function save() {
    const latN = Number(lat);
    const lngN = Number(lng);
    if (!lat.trim() || !lng.trim() || !Number.isFinite(latN) || !Number.isFinite(lngN)) {
      toast.error("Enter both latitude and longitude");
      return;
    }
    const radiusN = radius.trim() === "" ? null : Number(radius);
    if (radiusN !== null && !Number.isInteger(radiusN)) {
      toast.error("Radius must be a whole number of metres");
      return;
    }
    setBusy(true);
    const r = await setLocationGeofence({
      locationId: site.id,
      lat: latN,
      lng: lngN,
      radiusM: radiusN,
    });
    setBusy(false);
    if (!r.success) {
      toast.error(r.error);
      return;
    }
    toast.success(`${site.name} pinned`);
    onSaved(r.data);
  }

  async function clearPin() {
    setBusy(true);
    const r = await setLocationGeofence({ locationId: site.id, lat: null, lng: null });
    setBusy(false);
    if (!r.success) {
      toast.error(r.error);
      return;
    }
    toast.success(`${site.name} unpinned`);
    onSaved(r.data);
  }

  if (!editing) {
    return (
      <li className="flex items-center justify-between gap-3 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {site.name}
            {!site.is_active && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">(inactive)</span>
            )}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {site.lat !== null ? (
              <>
                {site.lat.toFixed(5)}, {site.lng?.toFixed(5)} ·{" "}
                {site.geofence_radius_m ?? defaultRadiusM}m
                {site.geofence_radius_m === null && " (default)"}
              </>
            ) : (
              "Not pinned — punches here won't be verified"
            )}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onEdit} className="shrink-0">
          <Crosshair className="mr-1 h-3.5 w-3.5" />
          {site.lat !== null ? "Edit" : "Set location"}
        </Button>
      </li>
    );
  }

  return (
    <li className="space-y-2 p-3">
      <p className="text-sm font-medium">{site.name}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={lat}
          onChange={(e) => setLat(e.target.value)}
          placeholder="Latitude"
          inputMode="decimal"
          className="h-8 w-32 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          value={lng}
          onChange={(e) => setLng(e.target.value)}
          placeholder="Longitude"
          inputMode="decimal"
          className="h-8 w-32 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          value={radius}
          onChange={(e) => setRadius(e.target.value)}
          placeholder={`${defaultRadiusM} (default)`}
          inputMode="numeric"
          className="h-8 w-32 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <span className="text-xs text-muted-foreground">m radius</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={findFromAddress} disabled={busy || !site.address}>
          <Search className="mr-1 h-3.5 w-3.5" />
          Find from address
        </Button>
        <Button size="sm" onClick={save} disabled={busy}>
          <Check className="mr-1 h-3.5 w-3.5" />
          {busy ? "Saving…" : "Save pin"}
        </Button>
        {site.lat !== null && (
          <Button variant="ghost" size="sm" onClick={clearPin} disabled={busy}>
            Clear pin
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      {site.address && (
        <p className="text-xs text-muted-foreground">Address on file: {site.address}</p>
      )}
    </li>
  );
}
