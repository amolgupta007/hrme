"use client";

import * as React from "react";
import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  updatePayrollEntry,
  listPayrollLineItems,
  addPayrollLineItem,
  removePayrollLineItem,
  type PayrollEntry,
  type PayrollLineItemRow,
} from "@/actions/payroll";
import { formatINR } from "@/lib/ctc";

interface Props {
  open: boolean;
  onClose: () => void;
  entry: PayrollEntry;
}

export function EntryEditDialog({ open, onClose, entry }: Props) {
  const [lopDays, setLopDays] = useState(String(entry.lop_days ?? 0));
  const [saving, setSaving] = useState(false);

  const [items, setItems] = React.useState<PayrollLineItemRow[]>([]);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [newCategory, setNewCategory] = React.useState<
    "bonus" | "allowance" | "reimbursement" | "other"
  >("bonus");
  const [newAmount, setNewAmount] = React.useState("");
  const [newTaxable, setNewTaxable] = React.useState(true);
  const [newNote, setNewNote] = React.useState("");

  const lopNum = parseFloat(lopDays) || 0;

  React.useEffect(() => {
    if (!open) return;
    listPayrollLineItems(entry.id).then((r) => {
      if (r.success) setItems(r.data);
    });
  }, [open, entry.id, refreshKey]);

  async function handleAddItem() {
    const amt = Number(newAmount);
    if (!Number.isFinite(amt) || amt < 0) {
      toast.error("Enter a valid amount");
      return;
    }
    const r = await addPayrollLineItem({
      payroll_entry_id: entry.id,
      category: newCategory,
      amount: Math.round(amt),
      taxable: newTaxable,
      note: newNote.trim() || null,
    });
    if (!r.success) {
      toast.error(r.error);
      return;
    }
    setNewAmount("");
    setNewNote("");
    setRefreshKey((k) => k + 1);
    toast.success("Line item added");
  }

  async function handleRemoveItem(id: string) {
    const r = await removePayrollLineItem(id);
    if (!r.success) {
      toast.error(r.error);
      return;
    }
    setRefreshKey((k) => k + 1);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const result = await updatePayrollEntry(entry.id, {
        bonus: 0,
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

          {/* Line items */}
          <div className="rounded-lg border border-border p-3 space-y-2">
            <p className="text-xs font-semibold">Line items</p>
            {items.length === 0 ? (
              <p className="text-xs text-muted-foreground">No line items yet.</p>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {items.map((it) => (
                  <li
                    key={it.id}
                    className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5"
                  >
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary capitalize">
                        {it.category}
                      </span>
                      <span className="font-semibold tabular-nums">{formatINR(it.amount)}</span>
                      {!it.taxable && (
                        <span className="text-[10px] text-muted-foreground">non-taxable</span>
                      )}
                      {it.note && (
                        <span className="truncate text-muted-foreground">— {it.note}</span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(it.id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid grid-cols-12 gap-1.5 pt-1 items-end">
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as any)}
                className="col-span-3 rounded-md border border-input bg-background px-2 py-1 text-xs"
              >
                <option value="bonus">Bonus</option>
                <option value="allowance">Allowance</option>
                <option value="reimbursement">Reimbursement</option>
                <option value="other">Other</option>
              </select>
              <input
                type="number"
                min={0}
                step={1}
                placeholder="Amount"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                className="col-span-2 rounded-md border border-input bg-background px-2 py-1 text-xs"
              />
              <label className="col-span-2 inline-flex items-center gap-1 text-[10px]">
                <input
                  type="checkbox"
                  checked={newTaxable}
                  onChange={(e) => setNewTaxable(e.target.checked)}
                />{" "}
                Taxable
              </label>
              <input
                type="text"
                placeholder="Note (optional)"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                className="col-span-3 rounded-md border border-input bg-background px-2 py-1 text-xs"
              />
              <Button type="button" size="sm" onClick={handleAddItem} className="col-span-2">
                Add
              </Button>
            </div>
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
