"use client";

import { useEffect, useState } from "react";
import Map, { Marker, NavigationControl } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { MapPin, Smartphone } from "lucide-react";
import { getMapboxToken, DEFAULT_INDIA_VIEWPORT, MAPBOX_STYLE } from "@/lib/mapbox";
import { listActiveSessions } from "@/actions/geo-sessions";
import type { ActiveSessionView } from "@/lib/geo/session-types";

function EmptyState({
  title,
  body,
  icon,
}: {
  title: string;
  body: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded border border-dashed bg-muted/20 p-12 text-center">
      <div className="flex justify-center mb-3">
        {icon ?? <MapPin className="h-8 w-8 text-muted-foreground" />}
      </div>
      <h3 className="font-semibold mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">{body}</p>
    </div>
  );
}

export default function LiveMap() {
  const [token] = useState<string | null>(() => {
    try {
      return getMapboxToken();
    } catch {
      return null;
    }
  });
  const [sessions, setSessions] = useState<ActiveSessionView[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function poll() {
      const res = await listActiveSessions();
      if (!active) return;
      if (res.success) setSessions(res.data);
      setLoading(false);
    }

    poll();
    const id = setInterval(poll, 30_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  if (!token) {
    return (
      <EmptyState
        title="Map unavailable"
        body="NEXT_PUBLIC_MAPBOX_TOKEN is not configured. Contact support."
      />
    );
  }

  if (!loading && sessions.length === 0) {
    return (
      <EmptyState
        title="No active sessions yet"
        body="Field staff will appear here when they check in via the JambaGeo mobile app (coming soon)."
        icon={<Smartphone className="h-8 w-8 text-muted-foreground" />}
      />
    );
  }

  const withCoords = sessions.filter(
    (s): s is ActiveSessionView & { last_lat: number; last_lng: number } =>
      s.last_lat !== null && s.last_lng !== null,
  );

  return (
    <div style={{ height: 600, width: "100%", borderRadius: 8, overflow: "hidden" }}>
      <Map
        mapboxAccessToken={token}
        initialViewState={DEFAULT_INDIA_VIEWPORT}
        mapStyle={MAPBOX_STYLE}
      >
        <NavigationControl position="top-left" />
        {withCoords.map((s) => (
          <Marker key={s.session_id} latitude={s.last_lat} longitude={s.last_lng}>
            <div
              className="rounded-full bg-primary text-primary-foreground p-1.5 shadow"
              title={s.employee_name}
            >
              <MapPin className="h-3 w-3" />
            </div>
          </Marker>
        ))}
      </Map>
    </div>
  );
}
