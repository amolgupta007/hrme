"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { upsertWeekOffPolicy } from "@/actions/week-off";
import { WEEK_DAYS, type WeekOffPolicy } from "@/lib/attendance/week-off";

export function WeekOffCard({ initial }: { initial: WeekOffPolicy | null }) {
  const [weekType, setWeekType] = useState<5 | 6>(initial?.week_type ?? 6);
  const [offDays, setOffDays] = useState<number[]>(initial?.off_days ?? [0]);
  const [altSaturdayRule, setAltSaturdayRule] = useState<"none" | "odd_off" | "even_off">(
    initial?.alt_saturday_rule ?? "none"
  );
  const [saving, setSaving] = useState(false);

  function toggleDay(d: number) {
    setOffDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b));
  }

  async function handleSave() {
    const expected = weekType === 5 ? 2 : 1;
    if (offDays.length !== expected) {
      return toast.error(weekType === 5 ? "Pick exactly 2 off days" : "Pick exactly 1 off day");
    }
    setSaving(true);
    const r = await upsertWeekOffPolicy({ week_type: weekType, off_days: offDays, alt_saturday_rule: altSaturdayRule });
    setSaving(false);
    if (r.success) toast.success("Week-off policy saved");
    else toast.error(r.error);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-semibold mb-2">Week-Off Policy</p>
      <div className="flex gap-3 text-sm mb-3">
        <label className="inline-flex items-center gap-1.5"><input type="radio" checked={weekType === 5} onChange={() => { setWeekType(5); setOffDays([0, 6]); }} />5-day week</label>
        <label className="inline-flex items-center gap-1.5"><input type="radio" checked={weekType === 6} onChange={() => { setWeekType(6); setOffDays([0]); }} />6-day week</label>
      </div>
      <div className="flex flex-wrap gap-2 text-xs mb-3">
        {WEEK_DAYS.map((d) => (
          <button
            key={d.value}
            type="button"
            onClick={() => toggleDay(d.value)}
            className={`rounded-full px-3 py-1 border ${offDays.includes(d.value) ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card"}`}
          >
            {d.label}
          </button>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-border mb-3">
        <p className="text-xs font-medium mb-2">Alternate Saturdays (India common patterns)</p>
        <div className="flex flex-wrap gap-3 text-xs">
          <label className="inline-flex items-center gap-1.5">
            <input type="radio" checked={altSaturdayRule === "none"} onChange={() => setAltSaturdayRule("none")} />
            None
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input type="radio" checked={altSaturdayRule === "odd_off"} onChange={() => setAltSaturdayRule("odd_off")} />
            1st + 3rd Sat off
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input type="radio" checked={altSaturdayRule === "even_off"} onChange={() => setAltSaturdayRule("even_off")} />
            2nd + 4th Sat off
          </label>
        </div>
      </div>
      <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save policy"}</Button>
    </div>
  );
}
