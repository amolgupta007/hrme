"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { GeofenceList, type GeofenceListProps } from "@/components/geo/geofence-list";

// Mapbox GL JS requires `window` — must be dynamically imported with ssr:false.
// The loading skeleton keeps layout stable while the bundle loads.
const GeofenceMap = dynamic(() => import("@/components/geo/geofence-map"), {
  ssr: false,
  loading: () => (
    <div className="h-[500px] w-full rounded-lg bg-muted/30 animate-pulse" />
  ),
});

type Geofence = GeofenceListProps["geofences"][number];

interface GeofencePageClientProps {
  geofences: Geofence[];
  isAdmin: boolean;
}

export function GeofencePageClient({ geofences, isAdmin }: GeofencePageClientProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingCreate, setPendingCreate] = useState<{
    center_lat: number;
    center_lng: number;
    radius_m: number;
  } | null>(null);

  return (
    <div className="grid md:grid-cols-[1fr_360px] gap-6 items-start">
      <GeofenceMap
        // GeofenceMap expects no `notes` field; cast is safe (extra fields ignored)
        geofences={geofences as Parameters<typeof GeofenceMap>[0]["geofences"]}
        canEdit={isAdmin}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCreate={setPendingCreate}
      />
      <GeofenceList
        geofences={geofences}
        isAdmin={isAdmin}
        selectedId={selectedId}
        onSelect={setSelectedId}
        pendingCreate={pendingCreate}
        onPendingCreateClear={() => setPendingCreate(null)}
      />
    </div>
  );
}
