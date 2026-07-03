"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { UserCheck, MapPin } from "lucide-react";
import { listGuestPunches, type GuestPunchRow } from "@/actions/guest-punches";

function fmtTime(iso: string) {
  // IST HH:MM, server-tz-independent.
  return new Date(new Date(iso).getTime() + 5.5 * 3600 * 1000).toISOString().slice(11, 16);
}
function fmtDate(iso: string) {
  return new Date(new Date(iso).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}
function isoDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Host-org "guest punches" panel — group-company employees who punched at this
 * org's devices. Explicitly excluded from this org's attendance/payroll. Renders
 * nothing when there are no guest punches (i.e. the org isn't hosting any group).
 */
export function GuestPunchesCard() {
  const [rows, setRows] = useState<GuestPunchRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const r = await listGuestPunches({ from: isoDaysAgo(7), to: isoDaysAgo(0) });
    setLoaded(true);
    if (r.success) setRows(r.data);
    else toast.error(r.error);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Hide entirely until we know there's something to show — no noise for non-group orgs.
  if (!loaded || rows.length === 0) return null;

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <UserCheck className="h-4 w-4" /> Guest punches (group companies)
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Employees of other companies in your group who punched at your devices. Shown for
          awareness only — <strong>not counted</strong> in your attendance or payroll.
        </p>
      </div>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Date</th>
              <th className="px-3 py-2 text-left font-medium">Time</th>
              <th className="px-3 py-2 text-left font-medium">Employee</th>
              <th className="px-3 py-2 text-left font-medium">Company</th>
              <th className="px-3 py-2 text-left font-medium">Location</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 text-muted-foreground">{fmtDate(r.punched_at)}</td>
                <td className="px-3 py-2 font-mono">{fmtTime(r.punched_at)}</td>
                <td className="px-3 py-2">{r.guest_employee_name ?? `PIN ${r.pin ?? "?"}`}</td>
                <td className="px-3 py-2">{r.guest_org_name}</td>
                <td className="px-3 py-2">
                  {r.location_name ? (
                    <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {r.location_name}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
