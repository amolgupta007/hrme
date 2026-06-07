"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { upsertShift } from "@/actions/shifts";
import type { Shift } from "@/actions/shifts";
import { computeShiftTotalHours, isOvernight } from "@/lib/attendance/shift-time";

interface Props {
  initial?: Shift;
  onClose: () => void;
}

export function ShiftFormDialog({ initial, onClose }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [start, setStart] = useState(initial?.start_time ?? "09:00");
  const [end, setEnd] = useState(initial?.end_time ?? "17:00");
  const [breakMin, setBreakMin] = useState(initial?.break_minutes ?? 0);
  const [graceMin, setGraceMin] = useState(initial?.grace_minutes ?? 10);
  const [halfDayMin, setHalfDayMin] = useState(initial?.half_day_threshold_minutes ?? 240);
  const [isDefault, setIsDefault] = useState(initial?.is_default ?? false);
  const [otEligible, setOtEligible] = useState(initial?.ot_eligible ?? true);
  const [active, setActive] = useState(initial?.active ?? true);
  const [saving, setSaving] = useState(false);

  const computed = useMemo(() => {
    try {
      return { total: computeShiftTotalHours(start, end, breakMin), overnight: isOvernight(start, end), err: undefined as string | undefined };
    } catch (e: any) {
      return { total: 0, overnight: false, err: e?.message as string };
    }
  }, [start, end, breakMin]);

  async function handleSave() {
    if (!name.trim()) return toast.error("Shift name required");
    if (computed.err) return toast.error(computed.err);
    setSaving(true);
    const r = await upsertShift({
      id: initial?.id,
      name: name.trim(),
      start_time: start,
      end_time: end,
      break_minutes: breakMin,
      grace_minutes: graceMin,
      half_day_threshold_minutes: halfDayMin,
      is_default: isDefault,
      ot_eligible: otEligible,
      active,
    });
    setSaving(false);
    if (r.success) { toast.success(initial ? "Shift updated" : "Shift created"); onClose(); }
    else toast.error(r.error);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-xl">
        <p className="text-sm font-semibold mb-3">{initial ? "Edit shift" : "Add shift"}</p>
        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="block text-xs text-muted-foreground mb-1">Name</span>
            <input className="w-full rounded-md border border-input bg-background px-3 py-1.5" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs text-muted-foreground mb-1">Start</span>
              <input type="time" className="w-full rounded-md border border-input bg-background px-3 py-1.5" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="block">
              <span className="block text-xs text-muted-foreground mb-1">End</span>
              <input type="time" className="w-full rounded-md border border-input bg-background px-3 py-1.5" value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="block text-xs text-muted-foreground mb-1">Break (m)</span>
              <input type="number" min={0} max={720} className="w-full rounded-md border border-input bg-background px-3 py-1.5" value={breakMin} onChange={(e) => setBreakMin(Number(e.target.value))} />
            </label>
            <label className="block">
              <span className="block text-xs text-muted-foreground mb-1">Grace (m)</span>
              <input type="number" min={0} max={120} className="w-full rounded-md border border-input bg-background px-3 py-1.5" value={graceMin} onChange={(e) => setGraceMin(Number(e.target.value))} />
            </label>
            <label className="block">
              <span className="block text-xs text-muted-foreground mb-1">Half-day &lt; (m)</span>
              <input type="number" min={30} max={720} className="w-full rounded-md border border-input bg-background px-3 py-1.5" value={halfDayMin} onChange={(e) => setHalfDayMin(Number(e.target.value))} />
            </label>
          </div>
          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Total: <span className="font-semibold tabular-nums text-foreground">{computed.err ? "—" : `${computed.total}h`}</span>
            {" · "}{computed.overnight ? "Overnight" : "Same day"}
            {computed.err ? <span className="ml-2 text-destructive">{computed.err}</span> : null}
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />Default shift</label>
            <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={otEligible} onChange={(e) => setOtEligible(e.target.checked)} />OT eligible</label>
            <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />Active</label>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </div>
  );
}
