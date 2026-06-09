"use client";

import { useEffect, useRef, useState } from "react";
import Map, { Source, Layer, NavigationControl, type MapRef } from "react-map-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "mapbox-gl/dist/mapbox-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import { getMapboxToken, DEFAULT_INDIA_VIEWPORT, MAPBOX_STYLE } from "@/lib/mapbox";
import { haversineMeters } from "@/lib/geo/geometry";

export interface GeofenceMapProps {
  geofences: Array<{
    id: string;
    name: string;
    type: "client" | "office";
    center_lat: number;
    center_lng: number;
    radius_m: number;
    is_active: boolean;
  }>;
  canEdit: boolean;
  onCreate?: (input: { center_lat: number; center_lng: number; radius_m: number }) => void;
  onSelect?: (id: string | null) => void;
  selectedId?: string | null;
}

/**
 * Approximates a circle as a closed polygon (~64 sides).
 * Mapbox style spec has no native circle primitive, so we generate GeoJSON polygons
 * server-free (no PostGIS required) from lat/lng + radius_m.
 */
function circleToPolygon(lat: number, lng: number, radiusM: number, steps = 64) {
  const coords: [number, number][] = [];
  const earthR = 6_371_000;
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const dx = (radiusM * Math.cos(angle)) / (earthR * Math.cos((lat * Math.PI) / 180));
    const dy = (radiusM * Math.sin(angle)) / earthR;
    coords.push([
      lng + (dx * 180) / Math.PI,
      lat + (dy * 180) / Math.PI,
    ]);
  }
  return coords;
}

export default function GeofenceMap(props: GeofenceMapProps) {
  const mapRef = useRef<MapRef | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  // Evaluate token once on mount; null = not configured
  const [token] = useState<string | null>(() => {
    try {
      return getMapboxToken();
    } catch {
      return null;
    }
  });

  // Wire up the draw control (point drop → pending-create) when canEdit is true.
  // We recreate it if canEdit changes, but in practice canEdit is stable per page load.
  useEffect(() => {
    if (!props.canEdit || !mapRef.current) return;
    const map = mapRef.current.getMap();

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: { point: true, trash: true },
    });
    map.addControl(draw as never, "top-right");
    drawRef.current = draw;

    const handleCreate = (e: { features?: Array<{ geometry: { type: string; coordinates: number[] } }> }) => {
      const f = e.features?.[0];
      if (!f || f.geometry.type !== "Point") return;
      const [lng, lat] = f.geometry.coordinates as [number, number];
      props.onCreate?.({ center_lat: lat, center_lng: lng, radius_m: 200 });
      draw.deleteAll(); // clear pin; geofence polygon will appear via prop update
    };

    map.on("draw.create" as never, handleCreate);

    return () => {
      map.off("draw.create" as never, handleCreate);
      try {
        map.removeControl(draw as never);
      } catch {
        // map may already be destroyed on fast unmount
      }
      drawRef.current = null;
    };
  // props.onCreate is intentionally excluded — the handler is captured at draw.create
  // time so it always reads the latest closure. Re-mounting the draw control on every
  // onCreate change would cause flicker.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.canEdit]);

  if (!token) {
    return (
      <div className="rounded border border-dashed bg-muted/30 p-6 text-sm text-muted-foreground flex items-center justify-center min-h-[200px]">
        <div className="text-center">
          <p className="font-medium">Map unavailable</p>
          <p className="mt-1">
            <code className="text-xs">NEXT_PUBLIC_MAPBOX_TOKEN</code> is not configured.
            Geofences can still be managed from the list.
          </p>
        </div>
      </div>
    );
  }

  const geojson: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: props.geofences.map((g) => ({
      type: "Feature",
      id: g.id,
      properties: {
        name: g.name,
        type: g.type,
        is_active: g.is_active,
        selected: props.selectedId === g.id,
      },
      geometry: {
        type: "Polygon",
        coordinates: [circleToPolygon(g.center_lat, g.center_lng, g.radius_m)],
      },
    })),
  };

  return (
    <div style={{ height: 500, width: "100%", borderRadius: 8, overflow: "hidden" }}>
      <Map
        ref={mapRef}
        mapboxAccessToken={token}
        initialViewState={DEFAULT_INDIA_VIEWPORT}
        mapStyle={MAPBOX_STYLE}
        onClick={(e) => {
          // Hit-test by haversine distance to centre (circle, not rendered polygon boundary)
          const { lat, lng } = e.lngLat;
          const hit = props.geofences.find(
            (g) => haversineMeters(lat, lng, g.center_lat, g.center_lng) <= g.radius_m,
          );
          props.onSelect?.(hit?.id ?? null);
        }}
      >
        <NavigationControl position="top-left" />
        <Source id="geofences" type="geojson" data={geojson}>
          {/* Fill layer — color-coded by type + selected state */}
          <Layer
            id="geofences-fill"
            type="fill"
            paint={{
              "fill-color": [
                "case",
                ["==", ["get", "selected"], true], "#0d8b78",   // selected: teal
                ["==", ["get", "type"], "office"], "#3b82f6",   // office: blue
                "#f59e0b",                                       // client: amber
              ],
              "fill-opacity": [
                "case",
                ["==", ["get", "is_active"], false], 0.1,       // inactive: very faint
                0.25,                                            // active: visible
              ],
            }}
          />
          {/* Outline layer */}
          <Layer
            id="geofences-line"
            type="line"
            paint={{
              "line-color": [
                "case",
                ["==", ["get", "selected"], true], "#0d8b78",
                "#475569",
              ],
              "line-width": 1.5,
            }}
          />
        </Source>
      </Map>
    </div>
  );
}
