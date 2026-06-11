"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { updateJambaGeoSettings } from "@/actions/settings";

interface JambaGeoSectionProps {
  enabled: boolean;
  defaultRetentionDays: number;
  defaultPingIntervalMin: number;
}

export function JambaGeoSection({
  enabled: initialEnabled,
  defaultRetentionDays: initialRetention,
  defaultPingIntervalMin: initialPingInterval,
}: JambaGeoSectionProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [retention, setRetention] = useState(initialRetention);
  const [pingInterval, setPingInterval] = useState(initialPingInterval);
  const [pending, startTransition] = useTransition();

  function save(partial: Parameters<typeof updateJambaGeoSettings>[0]) {
    startTransition(async () => {
      const res = await updateJambaGeoSettings(partial);
      if (res.success) toast.success("JambaGeo settings updated");
      else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-6 p-6">
      <p className="text-sm text-muted-foreground">
        Configure field-staff GPS tracking defaults. Geofences and visit logs are managed from the
        JambaGeo module.
      </p>

      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">Enable JambaGeo</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Shows the JambaGeo button in the top-right of the dashboard.
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={pending}
          onCheckedChange={(v) => {
            setEnabled(v);
            save({ enabled: v });
          }}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="jambageo-retention">Default location retention (days)</Label>
          <Input
            id="jambageo-retention"
            type="number"
            min={1}
            max={365}
            value={retention}
            onChange={(e) => setRetention(Number(e.target.value))}
            disabled={!enabled || pending}
          />
          <p className="text-xs text-muted-foreground">
            GPS pings older than this are deleted nightly. Applies when employees
            haven&apos;t set their own retention via the mobile consent screen. Default 90.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="jambageo-ping-interval">Default ping interval (minutes)</Label>
          <Input
            id="jambageo-ping-interval"
            type="number"
            min={5}
            max={60}
            value={pingInterval}
            onChange={(e) => setPingInterval(Number(e.target.value))}
            disabled={!enabled || pending}
          />
          <p className="text-xs text-muted-foreground">
            Mobile app pings this often during an active duty session. Default 15.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 border-t pt-4">
        <Button
          variant="outline"
          size="sm"
          disabled={!enabled || pending}
          onClick={() =>
            save({
              default_retention_days: retention,
              default_ping_interval_min: pingInterval,
            })
          }
        >
          Save defaults
        </Button>
      </div>

      <p className="text-xs text-muted-foreground border-t pt-3">
        Manage geofences →{" "}
        <Link href="/geo/geofences" className="text-primary hover:underline">
          JambaGeo &gt; Geofences
        </Link>
      </p>
    </div>
  );
}
