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
import { updatePayrollEntry, type PayrollEntry } from "@/actions/payroll";
import { formatINR } from "@/lib/ctc";

interface Props {
  open: boolean;
  onClose: () => void;
  entry: PayrollEntry;
}

export function EntryEditDialog({ open, onClose, entry }: Props) {
  const [bonus, setBonus] = useState(String(entry.bonus ?? 0));
  const [lopDays, setLopDays] = useState(String(entry.lop_days ?? 0));
  const [saving, setSaving] = useState(false);

  const bonusNum = parseFloat(bonus) || 0;
  const lopNum = parseFloat(lopDays) || 0;

  async function handleSave() {
    setSaving(true);
    try {
      const result = await updatePayrollEntry(entry.id, {
        bonus: bonusNum,
        lop_days: lopNum,
      });
      if (result.success) {
        toast.success("Entry updated");
        onClose();
      } else {
        toast.error(result.error);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Entry — {entry.employee_name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Current gross */}
          <div className="rounded-md bg-muted/50 border border-border px-4 py-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Gross Salary</span>
              <span className="font-mono">{formatINR(entry.gross_salary)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Standard Deductions</span>
              <span className="font-mono text-destructive">
                −{formatINR(entry.employee_pf + entry.professional_tax + entry.tds)}
              </span>
            </div>
          </div>

          {/* Bonus */}
          <div>
            <label className="text-sm font-medium">Bonus / One-time Pay (₹)</label>
            <input
              type="number"
              min={0}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              value={bonus}
              onChange={(e) => setBonus(e.target.value)}
            />
          </div>

          {/* LOP */}
          <div>
            <label className="text-sm font-medium">Loss of Pay (LOP) Days</label>
            <input
              type="number"
              min={0}
              step={0.5}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={lopDays}
              onChange={(e) => setLopDays(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Deduction = Gross ÷ Working Days × LOP Days
            </p>
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="flex-1">
              {saving ? "Saving…" : "Update"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
