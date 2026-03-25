"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Label from "@radix-ui/react-label";
import * as Select from "@radix-ui/react-select";
import { ChevronDown, X, AlertTriangle, Ticket } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { requestLeave } from "@/actions/leaves";
import type { Employee } from "@/types";
import type { PolicyWithUsage, EmployeeBalance } from "@/actions/leaves";

interface LeaveRequestFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: Employee[];
  policies: PolicyWithUsage[];
  balances: EmployeeBalance[];
}

const NONE = "__none__";
const inputCn =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50";

function calcDays(start: string, end: string): number {
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  if (e < s) return 0;
  return Math.floor((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

export function LeaveRequestForm({
  open, onOpenChange, employees, policies, balances,
}: LeaveRequestFormProps) {
  const [loading, setLoading] = React.useState(false);
  const [form, setForm] = React.useState({
    employeeId: "",
    policyId: "",
    startDate: "",
    endDate: "",
    reason: "",
    ticketNumber: "",
  });

  React.useEffect(() => {
    if (!open) setForm({ employeeId: "", policyId: "", startDate: "", endDate: "", reason: "", ticketNumber: "" });
  }, [open]);

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  const days = calcDays(form.startDate, form.endDate);

  // Compute remaining days for selected employee + policy
  const remainingDays = React.useMemo(() => {
    if (!form.employeeId || !form.policyId) return null;
    const policy = policies.find((p) => p.id === form.policyId);
    if (!policy) return null;
    const used = balances.find(
      (b) => b.employee_id === form.employeeId && b.policy_id === form.policyId
    )?.used_days ?? 0;
    return Math.max(0, policy.days_per_year - used);
  }, [form.employeeId, form.policyId, policies, balances]);

  const exceedsBalance = remainingDays !== null && days > remainingDays;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.employeeId || !form.policyId) {
      toast.error("Please select an employee and leave type");
      return;
    }
    if (days <= 0) {
      toast.error("End date must be on or after start date");
      return;
    }
    if (exceedsBalance && !form.ticketNumber.trim()) {
      toast.error("Ticket number is required when request exceeds available balance");
      return;
    }

    setLoading(true);
    const result = await requestLeave({
      employeeId: form.employeeId,
      policyId: form.policyId,
      startDate: form.startDate,
      endDate: form.endDate,
      days,
      reason: form.reason,
      ticketNumber: form.ticketNumber || undefined,
      exceedsBalance,
    });
    setLoading(false);

    if (result.success) {
      toast.success(
        exceedsBalance
          ? "Leave request submitted — marked for manual review (exceeds balance)"
          : "Leave request submitted"
      );
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
            <Dialog.Title className="text-lg font-semibold">Request Leave</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon"><X className="h-4 w-4" /></Button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Employee" required>
              <SelectField
                value={form.employeeId}
                onValueChange={(v) => set("employeeId", v)}
                placeholder="Select employee"
                options={employees.map((e) => ({ value: e.id, label: `${e.first_name} ${e.last_name}` }))}
              />
            </Field>

            <Field label="Leave Type" required>
              <SelectField
                value={form.policyId}
                onValueChange={(v) => set("policyId", v)}
                placeholder="Select leave type"
                options={policies.map((p) => {
                  const used = balances.find(
                    (b) => b.employee_id === form.employeeId && b.policy_id === p.id
                  )?.used_days ?? 0;
                  const remaining = Math.max(0, p.days_per_year - used);
                  return {
                    value: p.id,
                    label: form.employeeId
                      ? `${p.name} (${remaining} of ${p.days_per_year} days remaining)`
                      : `${p.name} (${p.days_per_year} days/yr)`,
                  };
                })}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Start Date" required>
                <input type="date" className={inputCn} value={form.startDate}
                  onChange={(e) => set("startDate", e.target.value)} required />
              </Field>
              <Field label="End Date" required>
                <input type="date" className={inputCn} value={form.endDate}
                  min={form.startDate} onChange={(e) => set("endDate", e.target.value)} required />
              </Field>
            </div>

            {/* Duration + balance status */}
            {days > 0 && (
              <div className={cn(
                "rounded-lg px-3 py-2.5 text-sm",
                exceedsBalance
                  ? "bg-destructive/10 border border-destructive/30"
                  : "bg-muted/60"
              )}>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Duration</span>
                  <span className="font-semibold">{days} day{days !== 1 ? "s" : ""}</span>
                </div>
                {remainingDays !== null && (
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-muted-foreground">Available balance</span>
                    <span className={cn("font-semibold", exceedsBalance && "text-destructive")}>
                      {remainingDays} day{remainingDays !== 1 ? "s" : ""}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Exceeds balance warning + ticket field */}
            {exceedsBalance && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-amber-800 dark:text-amber-300">
                    This request exceeds the available balance by{" "}
                    <strong>{days - remainingDays} day{days - remainingDays !== 1 ? "s" : ""}</strong>.
                    It will be flagged for manual admin review. A ticket number is required to proceed.
                  </p>
                </div>
                <Field label="Ticket / Reference Number" required>
                  <div className="relative">
                    <Ticket className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      className={cn(inputCn, "pl-9")}
                      value={form.ticketNumber}
                      onChange={(e) => set("ticketNumber", e.target.value)}
                      placeholder="e.g. TKT-2024-001"
                      required={exceedsBalance}
                    />
                  </div>
                </Field>
              </div>
            )}

            <Field label="Reason">
              <textarea
                className="flex min-h-[80px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                value={form.reason}
                onChange={(e) => set("reason", e.target.value)}
                placeholder="Optional reason..."
              />
            </Field>

            <div className="flex justify-end gap-3 pt-1">
              <Dialog.Close asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </Dialog.Close>
              <Button type="submit" disabled={loading} variant={exceedsBalance ? "destructive" : "default"}>
                {loading ? "Submitting..." : exceedsBalance ? "Submit for Manual Review" : "Submit Request"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label.Root className="text-sm font-medium">
        {label}{required && <span className="ml-0.5 text-destructive">*</span>}
      </Label.Root>
      {children}
    </div>
  );
}

function SelectField({ value, onValueChange, options, placeholder = "Select..." }: {
  value: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <Select.Root value={value || NONE} onValueChange={(v) => onValueChange(v === NONE ? "" : v)}>
      <Select.Trigger className={cn(inputCn, "flex items-center justify-between cursor-pointer")}>
        <Select.Value placeholder={placeholder} />
        <Select.Icon><ChevronDown className="h-4 w-4 opacity-50" /></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="z-50 max-h-60 min-w-[8rem] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-md">
          <Select.Viewport className="p-1">
            <Select.Item value={NONE} className="relative flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent data-[highlighted]:bg-accent">
              <Select.ItemText>{placeholder}</Select.ItemText>
            </Select.Item>
            {options.map((opt) => (
              <Select.Item key={opt.value} value={opt.value} className="relative flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent data-[highlighted]:bg-accent">
                <Select.ItemText>{opt.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
