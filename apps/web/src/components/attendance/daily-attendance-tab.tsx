"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { RefreshCw, MapPin, AlertTriangle, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getDailyAttendance,
  recalculateDay,
  type DailyAttendanceRow,
} from "@/actions/attendance-daily";
import { PunchTimelineDialog } from "./punch-timeline-dialog";
import { GuestPunchesCard } from "./guest-punches-card";

function fmtHours(min: number | null) {
  if (min == null) return "—";
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}
function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function isoDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const statusChip: Record<string, string> = {
  present: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  incomplete: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  absent: "bg-muted text-muted-foreground",
};

export function DailyAttendanceTab() {
  const [from, setFrom] = useState(isoDaysAgo(7));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [reviewOnly, setReviewOnly] = useState(false);
  const [rows, setRows] = useState<DailyAttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [recalcId, setRecalcId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<DailyAttendanceRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await getDailyAttendance({ from, to, reviewOnly });
    setLoading(false);
    if (r.success) setRows(r.data);
    else toast.error(r.error);
  }, [from, to, reviewOnly]);

  useEffect(() => {
    load();
  }, [load]);

  async function recalc(row: DailyAttendanceRow) {
    setRecalcId(row.id);
    const r = await recalculateDay(row.employee_id, row.date);
    setRecalcId(null);
    if (r.success) {
      toast.success("Day recalculated");
      load();
    } else toast.error(r.error);
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Cpu className="h-4 w-4" /> Device attendance (by location)
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Daily records derived from biometric punches — first-in / last-out across the
          employee&apos;s zone. Punches outside the zone are excluded and counted separately.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          />
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          />
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={reviewOnly}
            onChange={(e) => setReviewOnly(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          Review queue only
          <span className="text-xs text-muted-foreground">(incomplete / out-of-zone / pending punches)</span>
        </label>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm font-medium">No device records in this range</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {reviewOnly
              ? "Nothing needs review — every day is complete and in-zone."
              : "Once a registered device pushes punches, daily records appear here. Set up devices in Settings → Attendance → Biometric Devices."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Employee</th>
                <th className="px-3 py-2 text-left font-medium">Date</th>
                <th className="px-3 py-2 text-left font-medium">In</th>
                <th className="px-3 py-2 text-left font-medium">Out</th>
                <th className="px-3 py-2 text-left font-medium">Hours</th>
                <th className="px-3 py-2 text-left font-medium">Punches</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="px-3 py-2 font-medium">{r.employee_name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.date}</td>
                  <td className="px-3 py-2">
                    <div>{fmtTime(r.clock_in_at)}</div>
                    {r.first_in_location && (
                      <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {r.first_in_location}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div>{fmtTime(r.clock_out_at)}</div>
                    {r.last_out_location && (
                      <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {r.last_out_location}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">{fmtHours(r.total_minutes)}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => setTimeline(r)}
                      className="rounded px-1 font-medium text-primary underline-offset-2 hover:underline"
                      title="View punch timeline"
                    >
                      {(r.punch_count ?? 0) === 0 && r.has_pending_punches
                        ? "Review punches"
                        : `${r.punch_count ?? 0} punch${(r.punch_count ?? 0) === 1 ? "" : "es"}`}
                    </button>
                    {(r.out_of_zone_count ?? 0) > 0 && (
                      <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        {r.out_of_zone_count} out-of-zone
                      </span>
                    )}
                    {r.has_pending_punches && (
                      <span className="ml-1 inline-flex items-center rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                        pending approval
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${
                        statusChip[r.derived_status ?? "absent"]
                      }`}
                    >
                      {r.derived_status ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => recalc(r)}
                      disabled={recalcId === r.id}
                      title="Recalculate this day from its punches"
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${recalcId === r.id ? "animate-spin" : ""}`}
                      />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <GuestPunchesCard />

      {timeline && (
        <PunchTimelineDialog
          open={!!timeline}
          onOpenChange={(v) => {
            if (!v) {
              setTimeline(null);
              load();
            }
          }}
          employeeId={timeline.employee_id}
          date={timeline.date}
          employeeName={timeline.employee_name}
          canApprove
          canVoid
        />
      )}
    </div>
  );
}
