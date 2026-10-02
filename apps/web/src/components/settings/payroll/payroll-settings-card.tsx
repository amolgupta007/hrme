"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { savePayrollSettings, type PayrollSettingsInput } from "@/actions/payroll-config";
import type { OrgPayrollSettings } from "@/lib/payroll/engine-config";
import { NormNote } from "./norm-note";
import { field, select } from "./styles";

function toForm(s: OrgPayrollSettings, month: string): PayrollSettingsInput {
  return {
    effectiveFromMonth: month,
    inputMode: s.inputMode,
    dayBasis: s.dayBasis.type,
    fixedDays: s.dayBasis.type === "fixed_days" ? s.dayBasis.days : 26,
    lopSource: s.lopSource,
    lopTreatment: s.lopTreatment,
    prorateJoinersLeavers: s.prorateJoinersLeavers,
    lineRounding: s.lineRounding,
    netRounding: s.netRounding,
    reason: "",
  };
}

export function PayrollSettingsCard({
  settings,
  month,
  onSaved,
}: {
  settings: OrgPayrollSettings;
  month: string;
  onSaved: () => void;
}) {
  const initial = toForm(settings, month);
  const [f, setF] = useState<PayrollSettingsInput>(initial);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof PayrollSettingsInput>(k: K, v: PayrollSettingsInput[K]) => setF((p) => ({ ...p, [k]: v }));
  const dirty = JSON.stringify({ ...f, reason: "" }) !== JSON.stringify({ ...initial, reason: "" });

  async function save() {
    setSaving(true);
    const res = await savePayrollSettings({ ...f, fixedDays: f.dayBasis === "fixed_days" ? f.fixedDays : null });
    setSaving(false);
    if (!res.success) return void toast.error(res.error);
    toast.success(`Payroll settings saved from ${f.effectiveFromMonth}`);
    onSaved();
  }

  return (
    <div className="space-y-5 rounded-lg border p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <SlidersHorizontal className="h-4 w-4" />
        </span>
        <div>
          <h3 className="font-semibold">How salaries are calculated</h3>
          <p className="text-sm text-muted-foreground">How salaries are entered, how a day&apos;s pay is worked out, and how unpaid days are handled.</p>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label className="text-sm font-medium" htmlFor="ps-mode">Salaries are entered as</label>
          <select id="ps-mode" className={select} value={f.inputMode} onChange={(e) => set("inputMode", e.target.value as PayrollSettingsInput["inputMode"])}>
            <option value="gross_first">Fixed monthly salary (gross) — CTC is worked out</option>
            <option value="ctc_first">Annual CTC — monthly salary is worked out</option>
          </select>
          <NormNote normKey="settings.input_mode" />
        </div>

        <div>
          <label className="text-sm font-medium" htmlFor="ps-days">A day&apos;s pay is based on</label>
          <div className="flex gap-2">
            <select id="ps-days" className={select} value={f.dayBasis} onChange={(e) => set("dayBasis", e.target.value as PayrollSettingsInput["dayBasis"])}>
              <option value="calendar_days">Calendar days in the month (28–31)</option>
              <option value="fixed_days">A fixed number of days</option>
            </select>
            {f.dayBasis === "fixed_days" && (
              <input
                type="number" min={1} max={31} aria-label="Days per month" className={`${field} w-20`}
                value={f.fixedDays ?? ""} onChange={(e) => set("fixedDays", e.target.value === "" ? null : Number(e.target.value))}
              />
            )}
          </div>
          <NormNote normKey="settings.day_basis" value={f.dayBasis === "fixed_days" ? f.fixedDays : undefined} />
        </div>

        <div>
          <label className="text-sm font-medium" htmlFor="ps-lop">Unpaid days come from</label>
          <select id="ps-lop" className={select} value={f.lopSource} onChange={(e) => set("lopSource", e.target.value as PayrollSettingsInput["lopSource"])}>
            <option value="unpaid_leave">Approved unpaid leave</option>
            <option value="negative_leave_balance">A leave balance going below zero</option>
            <option value="off">Nowhere — no automatic deduction</option>
          </select>
          <NormNote normKey="settings.lop_source" />
        </div>

        <div>
          <label className="text-sm font-medium" htmlFor="ps-lopt">Unpaid days are deducted by</label>
          <select id="ps-lopt" className={select} value={f.lopTreatment} onChange={(e) => set("lopTreatment", e.target.value as PayrollSettingsInput["lopTreatment"])}>
            <option value="prorate">Reducing each salary component for the days paid</option>
            <option value="deduction">A separate &quot;Loss of pay&quot; line</option>
          </select>
          <NormNote normKey="settings.lop_treatment" />
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm font-medium" htmlFor="ps-join">Pay joiners and leavers only for days employed</label>
            <Switch id="ps-join" checked={f.prorateJoinersLeavers} onCheckedChange={(v) => set("prorateJoinersLeavers", v)} />
          </div>
          <NormNote normKey="settings.prorate_joiners_leavers" value={f.prorateJoinersLeavers} />
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm font-medium" htmlFor="ps-round">Round deductions and net pay to the rupee</label>
            <Switch
              id="ps-round"
              checked={f.lineRounding === "rupee" && f.netRounding === "rupee"}
              onCheckedChange={(v) => setF((p) => ({ ...p, lineRounding: v ? "rupee" : "none", netRounding: v ? "rupee" : "none" }))}
            />
          </div>
          <NormNote normKey="settings.rounding" />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 border-t pt-4">
        <div>
          <label className="block text-sm font-medium" htmlFor="ps-from">Applies from pay month</label>
          <input id="ps-from" type="month" className={`${field} w-44`} value={f.effectiveFromMonth} onChange={(e) => set("effectiveFromMonth", e.target.value)} />
        </div>
        <div className="min-w-[14rem] flex-1">
          <label className="block text-sm font-medium" htmlFor="ps-why">Reason (kept in the change log)</label>
          <input id="ps-why" className={field} value={f.reason ?? ""} onChange={(e) => set("reason", e.target.value)} placeholder="Optional" />
        </div>
        <button
          onClick={save}
          disabled={(!dirty && f.effectiveFromMonth === month) || saving}
          className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50"
        >
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save settings
        </button>
      </div>
      <p className="text-xs text-muted-foreground">Months before the one you choose keep their current settings; months already processed never change.</p>
    </div>
  );
}
