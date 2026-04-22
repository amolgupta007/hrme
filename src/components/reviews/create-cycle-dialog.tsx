"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Label from "@radix-ui/react-label";
import { X, Plus, Calendar } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { createReviewCycle } from "@/actions/reviews";
import { CYCLE_TEMPLATES } from "@/config/review-cycle-templates";
import type { Employee } from "@/types";

const inputCn =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";

interface CreateCycleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: Employee[];
}

export function CreateCycleDialog({ open, onOpenChange, employees }: CreateCycleDialogProps) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [ratingScale, setRatingScale] = React.useState<3 | 5 | 10>(5);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setStartDate("");
      setEndDate("");
      setSelectedIds([]);
      setRatingScale(5);
    }
  }, [open]);

  function toggleEmployee(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function selectAll() {
    setSelectedIds(employees.map((e) => e.id));
  }

  function applyTemplate(templateId: string) {
    const tmpl = CYCLE_TEMPLATES.find((t) => t.id === templateId);
    if (!tmpl) return;
    setName(tmpl.getName());
    setDescription(tmpl.description);
    setStartDate(tmpl.getStartDate());
    setEndDate(tmpl.getEndDate());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedIds.length === 0) {
      toast.error("Select at least one employee");
      return;
    }
    setLoading(true);
    const result = await createReviewCycle({
      name,
      description,
      start_date: startDate,
      end_date: endDate,
      employee_ids: selectedIds,
      rating_scale: ratingScale,
    });
    setLoading(false);
    if (result.success) {
      toast.success("Review cycle created");
      onOpenChange(false);
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl bg-background p-6 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-5">
            <Dialog.Title className="text-lg font-semibold">New Review Cycle</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon"><X className="h-4 w-4" /></Button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Template picker */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Start from template</p>
              <div className="grid grid-cols-3 gap-2">
                {CYCLE_TEMPLATES.map((tmpl) => (
                  <button
                    key={tmpl.id}
                    type="button"
                    onClick={() => applyTemplate(tmpl.id)}
                    className="rounded-lg border border-border bg-muted/30 p-3 text-left hover:border-primary hover:bg-primary/5 transition-colors"
                  >
                    <Calendar className="h-4 w-4 text-primary mb-1.5" />
                    <p className="text-xs font-medium">{tmpl.name}</p>
                    <p className="text-xs text-muted-foreground">{tmpl.description}</p>
                  </button>
                ))}
              </div>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">or fill manually</span>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label.Root className="text-sm font-medium">Cycle Name <span className="text-destructive">*</span></Label.Root>
              <input
                className={inputCn}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Q1 2025 Performance Review"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label.Root className="text-sm font-medium">Rating Scale</Label.Root>
              <div className="flex gap-2">
                {([3, 5, 10] as const).map((scale) => (
                  <button
                    key={scale}
                    type="button"
                    onClick={() => setRatingScale(scale)}
                    className={cn(
                      "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                      ratingScale === scale
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-muted/50"
                    )}
                  >
                    {scale}-point
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label.Root className="text-sm font-medium">Description</Label.Root>
              <input
                className={inputCn}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label.Root className="text-sm font-medium">Start Date <span className="text-destructive">*</span></Label.Root>
                <input
                  type="date"
                  className={inputCn}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label.Root className="text-sm font-medium">End Date <span className="text-destructive">*</span></Label.Root>
                <input
                  type="date"
                  className={inputCn}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Employee selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label.Root className="text-sm font-medium">
                  Employees <span className="text-destructive">*</span>
                  <span className="ml-2 text-muted-foreground font-normal">
                    ({selectedIds.length} selected)
                  </span>
                </Label.Root>
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-xs text-primary hover:underline"
                >
                  Select all
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-input divide-y divide-border">
                {employees.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">No employees found.</p>
                ) : (
                  employees.map((emp) => (
                    <label
                      key={emp.id}
                      className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/40 transition-colors"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input accent-primary"
                        checked={selectedIds.includes(emp.id)}
                        onChange={() => toggleEmployee(emp.id)}
                      />
                      <div>
                        <p className="text-sm font-medium">{emp.first_name} {emp.last_name}</p>
                        {emp.designation && (
                          <p className="text-xs text-muted-foreground">{emp.designation}</p>
                        )}
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <Dialog.Close asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </Dialog.Close>
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : (
                  <><Plus className="mr-2 h-4 w-4" />Create Cycle</>
                )}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
