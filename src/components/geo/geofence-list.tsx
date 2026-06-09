"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";
import {
  createGeofence,
  updateGeofence,
  toggleGeofenceActive,
  deleteGeofence,
} from "@/actions/geo-geofences";
import { formatGeofenceRadius } from "@/lib/geo/geometry";

export interface GeofenceListProps {
  geofences: Array<{
    id: string;
    name: string;
    type: "client" | "office";
    center_lat: number;
    center_lng: number;
    radius_m: number;
    is_active: boolean;
    notes: string | null;
  }>;
  isAdmin: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Populated when the user drops a pin on the map; null = no pending create. */
  pendingCreate: { center_lat: number; center_lng: number; radius_m: number } | null;
  onPendingCreateClear: () => void;
}

export function GeofenceList(props: GeofenceListProps) {
  const [isPending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"client" | "office">("client");

  function doCreate() {
    if (!props.pendingCreate || !newName.trim()) return;
    const coords = props.pendingCreate;
    startTransition(async () => {
      const res = await createGeofence({
        name: newName.trim(),
        type: newType,
        center_lat: coords.center_lat,
        center_lng: coords.center_lng,
        radius_m: coords.radius_m,
      });
      if (res.success) {
        toast.success(`Geofence "${newName.trim()}" created`);
        setNewName("");
        setNewType("client");
        props.onPendingCreateClear();
      } else {
        toast.error(res.error);
      }
    });
  }

  function doToggle(id: string, value: boolean) {
    startTransition(async () => {
      const res = await toggleGeofenceActive(id, value);
      if (!res.success) toast.error(res.error);
    });
  }

  function doUpdateRadius(id: string, radius_m: number) {
    if (!radius_m || radius_m < 1 || radius_m > 5000) return;
    startTransition(async () => {
      const res = await updateGeofence(id, { radius_m });
      if (!res.success) toast.error(res.error);
    });
  }

  function doDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? Lead-visit history is unaffected.`)) return;
    startTransition(async () => {
      const res = await deleteGeofence(id);
      if (res.success) {
        toast.success(`Deleted "${name}"`);
        if (props.selectedId === id) props.onSelect(null);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Pending-create card — appears when admin drops a pin on the map */}
      {props.isAdmin && props.pendingCreate && (
        <Card className="border-primary">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">New geofence</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {props.pendingCreate.center_lat.toFixed(5)},{" "}
              {props.pendingCreate.center_lng.toFixed(5)} · default radius{" "}
              {formatGeofenceRadius(props.pendingCreate.radius_m)} (editable after save)
            </p>
            <Input
              placeholder="Name (e.g. Andheri Office)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              disabled={isPending}
            />
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as "client" | "office")}
              disabled={isPending}
              className="w-full border rounded-md p-2 text-sm bg-background"
            >
              <option value="client">Client site</option>
              <option value="office">Office</option>
            </select>
            <div className="flex gap-2">
              <Button
                onClick={doCreate}
                disabled={isPending || !newName.trim()}
                size="sm"
              >
                Save
              </Button>
              <Button
                variant="ghost"
                onClick={props.onPendingCreateClear}
                size="sm"
                disabled={isPending}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {props.geofences.length === 0 && !props.pendingCreate && (
        <p className="text-sm text-muted-foreground py-4">
          {props.isAdmin
            ? "No geofences yet. Click anywhere on the map to drop a pin and create one."
            : "No geofences configured. Ask an admin to add them."}
        </p>
      )}

      {/* Geofence cards */}
      <div className="space-y-2">
        {props.geofences.map((g) => (
          <Card
            key={g.id}
            className={
              "cursor-pointer transition-colors " +
              (props.selectedId === g.id
                ? "border-primary ring-1 ring-primary"
                : "hover:border-muted-foreground/30")
            }
            onClick={() => props.onSelect(g.id)}
          >
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2 pt-3 px-3">
              <div className="min-w-0">
                <CardTitle className="text-sm truncate">{g.name}</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {g.type === "client" ? "Client site" : "Office"} ·{" "}
                  {formatGeofenceRadius(g.radius_m)}
                </p>
              </div>
              {!g.is_active && (
                <Badge variant="outline" className="ml-2 shrink-0 text-xs">
                  Inactive
                </Badge>
              )}
            </CardHeader>

            {props.isAdmin && (
              <CardContent className="space-y-2 pt-0 px-3 pb-3">
                <div
                  className="flex items-center gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Label className="text-xs shrink-0">Radius (m)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={5000}
                    defaultValue={g.radius_m}
                    onBlur={(e) => doUpdateRadius(g.id, Number(e.target.value))}
                    disabled={isPending}
                    className="h-7 text-xs"
                  />
                </div>
                <div
                  className="flex items-center justify-between"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={g.is_active}
                      onCheckedChange={(v) => doToggle(g.id, v)}
                      disabled={isPending}
                    />
                    <span className="text-xs text-muted-foreground">
                      {g.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    onClick={() => doDelete(g.id, g.name)}
                    disabled={isPending}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
