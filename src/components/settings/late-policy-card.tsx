"use client";

import { useState } from "react";
import { toast } from "sonner";
import { upsertLatePolicy, type LatePolicy, type LateConsequence } from "@/actions/late-policy";
import { LatePolicyTargetsSelect, type TargetRow } from "./late-policy-targets-select";
import { LatePenaltyBandsEditor } from "./late-penalty-bands-editor";
import type { PenaltyBand } from "@/lib/attendance/late-penalty-bands";

const DEFAULT_BANDS: PenaltyBand[] = [
  { min_late_days: 3, max_late_days: 4, deduction_days: 0.5 },
  { min_late_days: 5, max_late_days: 7, deduction_days: 2 },
];

export function LatePolicyCard({
  initialPolicy,
  initialTargets,
  initialBands,
  departments,
  employees,
}: {
  initialPolicy: LatePolicy | null;
  initialTargets: TargetRow[];
  initialBands: PenaltyBand[];
  departments: Array<{ id: string; name: string }>;
  employees: Array<{ id: string; name: string; department_id: string | null }>;
}) {
  const [enabled, setEnabled] = useState(initialPolicy?.enabled ?? false);
  const [name, setName] = useState(initialPolicy?.name ?? "Late Policy");
  const [threshold, setThreshold] = useState(initialPolicy?.threshold_days ?? 3);
  const [fallback, setFallback] = useState(initialPolicy?.fallback_cutoff_time ?? "");
  const [warnAt, setWarnAt] = useState<number | "">(initialPolicy?.warn_at ?? "");
  const [notifyLate, setNotifyLate] = useState(initialPolicy?.notify_on_late ?? true);
  const [notifyThreshold, setNotifyThreshold] = useState(initialPolicy?.notify_on_threshold ?? true);
  const [chEmail, setChEmail] = useState(initialPolicy?.channel_email ?? true);
  const [chWhatsapp, setChWhatsapp] = useState(initialPolicy?.channel_whatsapp ?? false);
  const [consequence, setConsequence] = useState<LateConsequence>(
    initialPolicy?.consequence ?? "block_bonus",
  );
  const [bands, setBands] = useState<PenaltyBand[]>(
    initialBands.length > 0 ? initialBands : DEFAULT_BANDS,
  );
  const [targets, setTargets] = useState<TargetRow[]>(initialTargets);
  const [saving, setSaving] = useState(false);

  const deducts = consequence === "salary_deduction" || consequence === "both";

  async function save() {
    setSaving(true);
    const res = await upsertLatePolicy({
      enabled, name, threshold_days: threshold,
      fallback_cutoff_time: fallback ? fallback : null,
      notify_on_late: notifyLate, notify_on_threshold: notifyThreshold,
      warn_at: warnAt === "" ? null : Number(warnAt),
      channel_whatsapp: chWhatsapp, channel_email: chEmail,
      consequence,
      targets,
      bands: deducts ? bands : [],
    });
    setSaving(false);
    if (res.success) toast.success("Late policy saved");
    else toast.error(res.error);
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Late Policy</h3>
          <p className="text-sm text-muted-foreground">Flag employees bonus-ineligible after too many late punch-ins.</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Enabled
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">Rule name
          <input className="mt-1 w-full rounded-md border px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="text-sm">Late days / month before block
          <input type="number" min={1} max={31} className="mt-1 w-full rounded-md border px-3 py-2" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
        </label>
        <label className="text-sm">Fallback cutoff (no shift) — HH:MM
          <input type="time" className="mt-1 w-full rounded-md border px-3 py-2" value={fallback} onChange={(e) => setFallback(e.target.value)} />
        </label>
        <label className="text-sm">Warn at (optional)
          <input type="number" min={1} max={31} className="mt-1 w-full rounded-md border px-3 py-2" value={warnAt} onChange={(e) => setWarnAt(e.target.value === "" ? "" : Number(e.target.value))} />
        </label>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={notifyLate} onChange={(e) => setNotifyLate(e.target.checked)} /> Notify on each late punch</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={notifyThreshold} onChange={(e) => setNotifyThreshold(e.target.checked)} /> Notify on threshold</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={chEmail} onChange={(e) => setChEmail(e.target.checked)} /> Email</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={chWhatsapp} onChange={(e) => setChWhatsapp(e.target.checked)} /> WhatsApp</label>
      </div>

      <div className="space-y-2 rounded-md border border-dashed p-3">
        <label className="text-sm font-medium">Consequence
          <select
            className="mt-1 block w-full rounded-md border px-3 py-2 text-sm"
            value={consequence}
            onChange={(e) => setConsequence(e.target.value as LateConsequence)}
          >
            <option value="block_bonus">Block bonus</option>
            <option value="salary_deduction">Deduct salary (bands)</option>
            <option value="both">Both — block bonus &amp; deduct salary</option>
            <option value="none">None (notify only)</option>
          </select>
        </label>
        {deducts && (
          <div className="pt-1">
            <p className="mb-2 text-xs text-muted-foreground">
              Deduct N days of salary based on how many days the employee was late this month
              (per-day rate = gross ÷ working days, same as LOP). Deduction reduces net pay only.
            </p>
            <LatePenaltyBandsEditor value={bands} onChange={setBands} />
          </div>
        )}
      </div>

      <div>
        <p className="mb-1 text-sm font-medium">Applies to</p>
        <LatePolicyTargetsSelect departments={departments} employees={employees} value={targets} onChange={setTargets} />
      </div>

      <button onClick={save} disabled={saving} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">
        {saving ? "Saving…" : "Save late policy"}
      </button>
    </div>
  );
}
