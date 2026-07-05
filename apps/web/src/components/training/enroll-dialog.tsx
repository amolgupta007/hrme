"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { enrollEmployees } from "@/actions/training";
import type { Course, Enrollment } from "@/actions/training";
import type { Employee } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course: Course;
  employees: Employee[];
  existingEnrollments: Enrollment[];
}

export function EnrollDialog({ open, onOpenChange, course, employees, existingEnrollments }: Props) {
  const enrolledIds = new Set(existingEnrollments.map((e) => e.employee_id));
  const available = employees.filter((e) => !enrolledIds.has(e.id));

  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (open) setSelectedIds([]);
  }, [open]);

  function toggle(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function selectAll() {
    setSelectedIds(available.map((e) => e.id));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedIds.length === 0) { toast.error("Select at least one employee"); return; }
    setLoading(true);
    const result = await enrollEmployees(course.id, selectedIds);
    setLoading(false);
    if (result.success) {
      toast.success(`Enrolled ${selectedIds.length} employee${selectedIds.length > 1 ? "s" : ""}`);
      onOpenChange(false);
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-background p-6 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-1">
            <Dialog.Title className="text-lg font-semibold">Assign Course</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon"><X className="h-4 w-4" /></Button>
            </Dialog.Close>
          </div>
          <p className="text-sm text-muted-foreground mb-5">{course.title}</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  Employees
                  <span className="ml-2 text-muted-foreground font-normal">
                    ({selectedIds.length} selected)
                  </span>
                </span>
                {available.length > 0 && (
                  <button type="button" onClick={selectAll} className="text-xs text-primary hover:underline">
                    Select all
                  </button>
                )}
              </div>

              <div className="max-h-56 overflow-y-auto rounded-lg border border-input divide-y divide-border">
                {available.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">All employees are already enrolled.</p>
                ) : (
                  available.map((emp) => (
                    <label
                      key={emp.id}
                      className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/40 transition-colors"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input accent-primary"
                        checked={selectedIds.includes(emp.id)}
                        onChange={() => toggle(emp.id)}
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
              <Button type="submit" disabled={loading || available.length === 0}>
                {loading ? "Assigning..." : (
                  <><UserPlus className="mr-2 h-4 w-4" />Assign</>
                )}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
