"use client";

import { useState } from "react";
import { toast } from "sonner";
import { upsertLatePolicy, type LatePolicy, type LateConsequence } from "@/actions/late-policy";
import { LatePolicyTargetsSelect, type TargetRow } from "./late-policy-targets-select";
import { LatePenaltyBandsEditor } from "./late-penalty-bands-editor";
import type { PenaltyBand } from "@/lib/attendance/late-penalty-bands";
import { describeLadder } from "@jambahr/shared/attendance/late-ladder";

const LEAVE_TYPES = [
  { value: "casual", label: "Casual leave" },
  { value: "paid", label: "Earned / paid leave" },
  { value: "sick", label: "Sick leave" },
  { value: "custom", label: "Custom leave type" },
] as const;
type LadderLeaveType = (typeof LEAVE_TYPES)[number]["value"];

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
  // Warning + leave-deduction ladder
  const [ladderWarnAt, setLadderWarnAt] = useState<number | "">(initialPolicy?.ladder_warning_at ?? 3);
  const [ladderDeductAt, setLadderDeductAt] = useState(initialPolicy?.ladder_deduct_at ?? 5);
  const [ladderDays, setLadderDays] = useState(Number(initialPolicy?.ladder_deduct_days ?? 1));
  const [ladderLeave, setLadderLeave] = useState<LadderLeaveType>(initialPolicy?.ladder_leave_type ?? "casual");
  const [ladderRepeat, setLadderRepeat] = useState(initialPolicy?.ladder_repeat ?? true);
  const [ladderLop, setLadderLop] = useState(initialPolicy?.ladder_lop_fallback ?? true);
  const [ccManagers, setCcManagers] = useState(initialPolicy?.ladder_cc_managers ?? true);
  const [ccAdmins, setCcAdmins] = useState(initialPolicy?.ladder_cc_admins ?? false);
  const [disputeDays, setDisputeDays] = useState(initialPolicy?.ladder_dispute_days ?? 2);
  const [saving, setSaving] = useState(false);

  const deducts = consequence === "salary_deduction" || consequence === "both";
  const ladder = consequence === "leave_deduction";
  const leaveLabel = (LEAVE_TYPES.find((t) => t.value === ladderLeave)?.label ?? "leave").toLowerCase();
  const ladderPreview = describeLadder({
    warningAt: ladderWarnAt === "" ? null : Number(ladderWarnAt),
    deductAt: ladderDeductAt,
    deductDays: ladderDays,
    repeat: ladderRepeat,
    lopFallback: ladderLop,
    leaveLabel,
  });

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
      ladder_warning_at: ladderWarnAt === "" ? null : Number(ladderWarnAt),
      ladder_deduct_at: ladderDeductAt,
      ladder_deduct_days: ladderDays,
      ladder_leave_type: ladderLeave,
      ladder_repeat: ladderRepeat,
      ladder_lop_fallback: ladderLop,
      ladder_cc_managers: ccManagers,
      ladder_cc_admins: ccAdmins,
      ladder_dispute_days: disputeDays,
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
          <p className="text-sm text-muted-foreground">
            What happens when employees punch in late too often in a calendar month.
          </p>
          {enabled && initialPolicy?.evaluate_from && (
            <p className="mt-1 text-xs text-muted-foreground">
              Counting late arrivals from{" "}
              {new Date(`${initialPolicy.evaluate_from}T00:00:00+05:30`).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
              . Week-offs, holidays, approved leave and excused days never count.
            </p>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Enabled
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">Rule name
          <input className="mt-1 w-full rounded-md border px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        {!ladder && (
          <label className="text-sm">Late days / month before block
            <input type="number" min={1} max={31} className="mt-1 w-full rounded-md border px-3 py-2" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
          </label>
        )}
        <label className="text-sm">Fallback cutoff (no shift) — HH:MM
          <input type="time" className="mt-1 w-full rounded-md border px-3 py-2" value={fallback} onChange={(e) => setFallback(e.target.value)} />
        </label>
        {!ladder && (
          <label className="text-sm">Warn at (optional)
            <input type="number" min={1} max={31} className="mt-1 w-full rounded-md border px-3 py-2" value={warnAt} onChange={(e) => setWarnAt(e.target.value === "" ? "" : Number(e.target.value))} />
          </label>
        )}
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={notifyLate} onChange={(e) => setNotifyLate(e.target.checked)} /> Notify on each late punch</label>
        {!ladder && (
          <label className="flex items-center gap-2"><input type="checkbox" checked={notifyThreshold} onChange={(e) => setNotifyThreshold(e.target.checked)} /> Notify on threshold</label>
        )}
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
            <option value="leave_deduction">Warning + leave deduction</option>
            <option value="none">None (notify only)</option>
          </select>
        </label>
        {ladder && (
          <div className="space-y-3 pt-1">
            <p className="text-xs text-muted-foreground">
              A formal warning email, then a leave deduction. Leave is deducted first; if the balance runs out, the
              rest becomes loss of pay in that month&apos;s payroll. Emails go to the employee with their reporting
              manager(s) in CC. If a late is later excused or corrected, the deduction is reversed automatically
              (unless that month&apos;s payroll is already paid, in which case it is flagged for review).
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <label className="text-sm">Warning at late #
                <input type="number" min={1} max={31} placeholder="None" className="mt-1 w-full rounded-md border px-3 py-2" value={ladderWarnAt} onChange={(e) => setLadderWarnAt(e.target.value === "" ? "" : Number(e.target.value))} />
              </label>
              <label className="text-sm">Deduct at late #
                <input type="number" min={1} max={31} className="mt-1 w-full rounded-md border px-3 py-2" value={ladderDeductAt} onChange={(e) => setLadderDeductAt(Number(e.target.value))} />
              </label>
              <label className="text-sm">Days deducted
                <select className="mt-1 block w-full rounded-md border px-3 py-2" value={ladderDays} onChange={(e) => setLadderDays(Number(e.target.value))}>
                  {[0.5, 1, 1.5, 2, 2.5, 3, 4, 5].map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">Leave type
                <select className="mt-1 block w-full rounded-md border px-3 py-2" value={ladderLeave} onChange={(e) => setLadderLeave(e.target.value as LadderLeaveType)}>
                  {LEAVE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">Dispute window (working days)
                <input type="number" min={0} max={30} className="mt-1 w-full rounded-md border px-3 py-2" value={disputeDays} onChange={(e) => setDisputeDays(Number(e.target.value))} />
              </label>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={ladderRepeat} onChange={(e) => setLadderRepeat(e.target.checked)} /> Repeat every {ladderDeductAt} lates</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={ladderLop} onChange={(e) => setLadderLop(e.target.checked)} /> Loss of pay when leave runs out</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={ccManagers} onChange={(e) => setCcManagers(e.target.checked)} /> CC reporting managers</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={ccAdmins} onChange={(e) => setCcAdmins(e.target.checked)} /> CC owners &amp; admins</label>
            </div>
            <p className="rounded-md bg-muted/60 px-3 py-2 text-sm">
              <span className="font-medium">Preview:</span> {ladderPreview}
            </p>
            {ladderWarnAt !== "" && Number(ladderWarnAt) >= ladderDeductAt && (
              <p className="text-xs text-destructive">The warning must come before the deduction.</p>
            )}
          </div>
        )}
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
