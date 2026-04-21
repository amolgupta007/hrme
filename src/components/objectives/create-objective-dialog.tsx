"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Label from "@radix-ui/react-label";
import { X, Plus, Trash2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { createObjectiveSet, updateObjectiveSet } from "@/actions/objectives";
import type { ObjectiveSet, ObjectiveItem } from "@/actions/objectives";
import { OBJECTIVE_TEMPLATES, type ObjectiveTemplate } from "@/config/objective-templates";

const inputCn =
  "flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";

function generateId() {
  return Math.random().toString(36).slice(2);
}

function getPeriodOptions(type: "quarterly" | "yearly"): string[] {
  const year = new Date().getFullYear();
  if (type === "quarterly") {
    return [
      `Q1 ${year}`, `Q2 ${year}`, `Q3 ${year}`, `Q4 ${year}`,
      `Q1 ${year + 1}`, `Q2 ${year + 1}`, `Q3 ${year + 1}`, `Q4 ${year + 1}`,
    ];
  }
  return [`${year}`, `${year + 1}`, `${year + 2}`];
}

function emptyItem(): ObjectiveItem {
  return {
    id: generateId(),
    title: "",
    description: "",
    success_criteria: "",
    weight: 0,
    self_progress: null,
    self_status: null,
    self_comment: null,
    manager_rating: null,
    manager_comment: null,
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: ObjectiveSet;
  template?: ObjectiveTemplate;
}

export function CreateObjectiveDialog({ open, onOpenChange, editing, template }: Props) {
  const [periodType, setPeriodType] = React.useState<"quarterly" | "yearly">(
    editing?.period_type ?? "quarterly"
  );
  const [periodLabel, setPeriodLabel] = React.useState(editing?.period_label ?? "");
  const [items, setItems] = React.useState<ObjectiveItem[]>(
    editing?.items && editing.items.length > 0
      ? editing.items
      : [emptyItem()]
  );
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      if (editing) {
        setPeriodType(editing.period_type ?? "quarterly");
        setPeriodLabel(editing.period_label ?? "");
        setItems(editing.items && editing.items.length > 0 ? editing.items : [emptyItem()]);
      } else if (template) {
        const year = new Date().getFullYear();
        const q = Math.floor(new Date().getMonth() / 3) + 1;
        setPeriodType("quarterly");
        setPeriodLabel(`Q${q} ${year}`);
        setItems(
          template.items.map((ti) => ({
            ...emptyItem(),
            title: ti.title,
            description: ti.description,
            success_criteria: ti.success_criteria,
            weight: ti.weight,
          }))
        );
      } else {
        setPeriodType("quarterly");
        setPeriodLabel("");
        setItems([emptyItem()]);
      }
    }
  }, [open, editing, template]);

  const totalWeight = items.reduce((s, i) => s + (Number(i.weight) || 0), 0);
  const weightOk = totalWeight === 100;

  function updateItem(idx: number, patch: Partial<ObjectiveItem>) {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }

  function removeItem(idx: number) {
    if (items.length === 1) return;
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function autoDistribute() {
    const count = items.length;
    const base = Math.floor(100 / count);
    const remainder = 100 - base * count;
    setItems((prev) =>
      prev.map((item, i) => ({ ...item, weight: i === 0 ? base + remainder : base }))
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!periodLabel) { toast.error("Select a period"); return; }
    if (!weightOk) { toast.error(`Weights must sum to 100% (currently ${totalWeight}%)`); return; }
    if (items.some((i) => !i.title.trim())) { toast.error("All objectives need a title"); return; }

    setLoading(true);
    const payload = { period_type: periodType, period_label: periodLabel, items };
    const result = editing
      ? await updateObjectiveSet(editing.id, payload)
      : await createObjectiveSet(payload);
    setLoading(false);

    if (result.success) {
      toast.success(editing ? "Objectives updated" : "Objectives saved as draft");
      onOpenChange(false);
    } else {
      toast.error(result.error);
    }
  }

  const periodOptions = getPeriodOptions(periodType);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-xl bg-background p-6 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-5">
            <Dialog.Title className="text-lg font-semibold">
              {editing ? "Edit Objectives" : template ? `Set Objectives — ${template.name}` : "Set Objectives"}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon"><X className="h-4 w-4" /></Button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Period selection */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label.Root className="text-sm font-medium">Period Type <span className="text-destructive">*</span></Label.Root>
                <select
                  className={cn(inputCn, "h-10")}
                  value={periodType}
                  onChange={(e) => { setPeriodType(e.target.value as "quarterly" | "yearly"); setPeriodLabel(""); }}
                >
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label.Root className="text-sm font-medium">Period <span className="text-destructive">*</span></Label.Root>
                <select
                  className={cn(inputCn, "h-10")}
                  value={periodLabel}
                  onChange={(e) => setPeriodLabel(e.target.value)}
                >
                  <option value="">Select period</option>
                  {periodOptions.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Weight indicator */}
            <div className="flex items-center gap-2">
              <div className={cn(
                "flex flex-1 items-center gap-2 rounded-lg px-3 py-2 text-sm",
                weightOk ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300"
                         : "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
              )}>
                {!weightOk && <AlertCircle className="h-4 w-4 shrink-0" />}
                <span>
                  Total weight: <strong>{totalWeight}%</strong>
                  {!weightOk && ` — must equal 100%`}
                </span>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={autoDistribute}>
                Auto-distribute
              </Button>
            </div>

            {/* Objective items */}
            <div className="space-y-3">
              <Label.Root className="text-sm font-medium">Objectives <span className="text-destructive">*</span></Label.Root>
              {items.map((item, idx) => (
                <div key={item.id} className="rounded-lg border border-border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Objective {idx + 1}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground"
                      onClick={() => removeItem(idx)}
                      disabled={items.length === 1}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-[1fr_80px] gap-3">
                    <div className="space-y-1">
                      <Label.Root className="text-xs text-muted-foreground">Title *</Label.Root>
                      <input
                        className={cn(inputCn, "h-9")}
                        value={item.title}
                        onChange={(e) => updateItem(idx, { title: e.target.value })}
                        placeholder="e.g. Increase customer retention to 90%"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label.Root className="text-xs text-muted-foreground">Weight %</Label.Root>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        className={cn(inputCn, "h-9")}
                        value={item.weight || ""}
                        onChange={(e) => updateItem(idx, { weight: Number(e.target.value) })}
                        placeholder="30"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label.Root className="text-xs text-muted-foreground">Description</Label.Root>
                    <input
                      className={cn(inputCn, "h-9")}
                      value={item.description}
                      onChange={(e) => updateItem(idx, { description: e.target.value })}
                      placeholder="Context and background"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label.Root className="text-xs text-muted-foreground">Success Criteria</Label.Root>
                    <input
                      className={cn(inputCn, "h-9")}
                      value={item.success_criteria}
                      onChange={(e) => updateItem(idx, { success_criteria: e.target.value })}
                      placeholder="How will you measure success?"
                    />
                  </div>
                </div>
              ))}

              <Button type="button" variant="outline" size="sm" onClick={addItem} className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                Add Objective
              </Button>
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <Dialog.Close asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </Dialog.Close>
              <Button type="submit" disabled={loading || !weightOk}>
                {loading ? "Saving..." : editing ? "Save Changes" : "Save Draft"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
