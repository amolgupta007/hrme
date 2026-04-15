"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { INDIAN_STATES } from "@/lib/ctc";
import { CTCBreakdownCard } from "./ctc-breakdown-card";
import { upsertSalaryStructure, deleteSalaryStructure } from "@/actions/payroll";
import type { SalaryStructureRow } from "@/actions/payroll";

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  designation: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  employees: Employee[];
  existing?: SalaryStructureRow | null;
}

export function SalaryStructureDialog({ open, onClose, employees, existing }: Props) {
  const [employeeId, setEmployeeId] = useState(existing?.employee_id ?? "");
  const [ctcInput, setCtcInput] = useState(existing ? String(existing.ctc) : "");
  const [state, setState] = useState(existing?.state ?? "maharashtra");
  const [isMetro, setIsMetro] = useState(existing?.is_metro ?? true);
  const [includeHra, setIncludeHra] = useState(existing?.include_hra ?? true);
  const [effectiveFrom, setEffectiveFrom] = useState(
    existing?.effective_from ?? new Date().toISOString().split("T")[0]
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Reset on open
  useEffect(() => {
    if (open) {
      setEmployeeId(existing?.employee_id ?? "");
      setCtcInput(existing ? String(existing.ctc) : "");
      setState(existing?.state ?? "maharashtra");
      setIsMetro(existing?.is_metro ?? true);
      setIncludeHra(existing?.include_hra ?? true);
      setEffectiveFrom(existing?.effective_from ?? new Date().toISOString().split("T")[0]);
    }
  }, [open, existing]);

  const ctc = parseFloat(ctcInput.replace(/,/g, "")) || 0;
  const isEdit = !!existing;

  async function handleSave() {
    if (!employeeId) return toast.error("Select an employee");
    if (ctc < 100000) return toast.error("CTC must be at least ₹1,00,000");
    if (!effectiveFrom) return toast.error("Enter effective from date");

    setSaving(true);
    try {
      const result = await upsertSalaryStructure({ employee_id: employeeId, ctc, state, is_metro: isMetro, include_hra: includeHra, effective_from: effectiveFrom });
      if (result.success) {
        toast.success(isEdit ? "Salary updated" : "Salary structure saved");
        onClose();
      } else {
        toast.error(result.error);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!existing) return;
    if (!confirm(`Remove salary structure for ${existing.employee_name}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const result = await deleteSalaryStructure(existing.employee_id);
      if (result.success) {
        toast.success("Salary structure removed");
        onClose();
      } else {
        toast.error(result.error);
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Salary Structure" : "Configure Salary"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
          {/* Left — form */}
          <div className="space-y-4">
            {/* Employee */}
            <div>
              <label className="text-sm font-medium">Employee *</label>
              <select
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                disabled={isEdit}
              >
                <option value="">Select employee…</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name}
                    {emp.designation ? ` — ${emp.designation}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* CTC */}
            <div>
              <label className="text-sm font-medium">Annual CTC (₹) *</label>
              <input
                type="text"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                placeholder="e.g. 600000"
                value={ctcInput}
                onChange={(e) => setCtcInput(e.target.value.replace(/[^0-9,]/g, ""))}
              />
              {ctc >= 100000 && (
                <p className="text-xs text-muted-foreground mt-1">
                  = ₹{(ctc / 100000).toFixed(2)} LPA
                </p>
              )}
            </div>

            {/* State */}
            <div>
              <label className="text-sm font-medium">State (for Professional Tax)</label>
              <select
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={state}
                onChange={(e) => setState(e.target.value)}
              >
                {INDIAN_STATES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            {/* HRA opt-in */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="include_hra"
                checked={includeHra}
                onChange={(e) => setIncludeHra(e.target.checked)}
                className="h-4 w-4 rounded"
              />
              <label htmlFor="include_hra" className="text-sm">
                Include HRA component{" "}
                <span className="text-muted-foreground">(employee has opted in with rent proof)</span>
              </label>
            </div>

            {/* Metro — only relevant when HRA is included */}
            {includeHra && (
              <div className="flex items-center gap-3 pl-7">
                <input
                  type="checkbox"
                  id="is_metro"
                  checked={isMetro}
                  onChange={(e) => setIsMetro(e.target.checked)}
                  className="h-4 w-4 rounded"
                />
                <label htmlFor="is_metro" className="text-sm">
                  Metro city{" "}
                  <span className="text-muted-foreground">(HRA: 50% of Basic vs 40%)</span>
                </label>
              </div>
            )}

            {/* Effective from */}
            <div>
              <label className="text-sm font-medium">Effective From *</label>
              <input
                type="date"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving} className="flex-1">
                {saving ? "Saving…" : isEdit ? "Update" : "Save Structure"}
              </Button>
              {isEdit && (
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? "…" : "Remove"}
                </Button>
              )}
            </div>
          </div>

          {/* Right — live breakdown */}
          <div>
            <p className="text-sm font-medium mb-2">Live Breakdown Preview</p>
            {ctc >= 100000 ? (
              <CTCBreakdownCard ctc={ctc} state={state} isMetro={isMetro} includeHra={includeHra} />
            ) : (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Enter a CTC of at least ₹1,00,000 to see the breakdown
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
