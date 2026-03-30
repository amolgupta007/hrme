"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createPayrollRun } from "@/actions/payroll";

interface Props {
  open: boolean;
  onClose: () => void;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function PayrollRunDialog({ open, onClose }: Props) {
  const now = new Date();
  // Default to previous month
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const defaultMonth = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}`;

  const [month, setMonth] = useState(defaultMonth);
  const [workingDays, setWorkingDays] = useState("26");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!month) return toast.error("Select a month");
    const wd = parseInt(workingDays);
    if (!wd || wd < 1 || wd > 31) return toast.error("Working days must be between 1 and 31");

    setSaving(true);
    try {
      const result = await createPayrollRun({ month, working_days: wd, notes: notes || undefined });
      if (result.success) {
        toast.success("Payroll run created as draft");
        onClose();
      } else {
        toast.error(result.error);
      }
    } finally {
      setSaving(false);
    }
  }

  const [yearStr, monthStr] = month.split("-");
  const monthLabel = yearStr && monthStr
    ? `${MONTHS[parseInt(monthStr) - 1]} ${yearStr}`
    : "";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Payroll Run</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <label className="text-sm font-medium">Payroll Month *</label>
            <input
              type="month"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
            {monthLabel && (
              <p className="text-xs text-muted-foreground mt-1">{monthLabel}</p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium">Working Days *</label>
            <input
              type="number"
              min={1}
              max={31}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={workingDays}
              onChange={(e) => setWorkingDays(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Used to calculate LOP deductions per day
            </p>
          </div>

          <div>
            <label className="text-sm font-medium">Notes (optional)</label>
            <textarea
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              rows={2}
              placeholder="e.g. Includes Q4 bonus cycle"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="rounded-md bg-muted/50 border border-border px-4 py-3 text-xs text-muted-foreground space-y-1">
            <p>After creating, click <strong>Process</strong> to compute salaries from configured salary structures.</p>
            <p>You can adjust individual entries (bonus, LOP) before marking as paid.</p>
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button onClick={handleCreate} disabled={saving} className="flex-1">
              {saving ? "Creating…" : "Create Run"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
