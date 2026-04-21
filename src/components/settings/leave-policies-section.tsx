"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Label from "@radix-ui/react-label";
import * as Select from "@radix-ui/react-select";
import { Plus, Pencil, Trash2, X, ChevronDown, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { addLeavePolicy, updateLeavePolicy, deleteLeavePolicy } from "@/actions/settings";
import type { LeavePolicy } from "@/types";

interface LeavePoliciesSectionProps {
  policies: LeavePolicy[];
}

type PolicyType = LeavePolicy["type"];

const LEAVE_TYPES: { value: PolicyType; label: string }[] = [
  { value: "paid", label: "Paid Leave" },
  { value: "sick", label: "Sick Leave" },
  { value: "casual", label: "Casual Leave" },
  { value: "unpaid", label: "Unpaid Leave" },
  { value: "maternity", label: "Maternity Leave" },
  { value: "paternity", label: "Paternity Leave" },
  { value: "custom", label: "Custom" },
];

const TYPE_COLORS: Record<PolicyType, string> = {
  paid: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  sick: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  casual: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  unpaid: "bg-muted text-muted-foreground",
  maternity: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  paternity: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  custom: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
};

const EMPTY_FORM = {
  name: "",
  type: "paid" as PolicyType,
  days_per_year: 21,
  carry_forward: false,
  max_carry_forward_days: 0,
  requires_approval: true,
};

const inputCn =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50";

export function LeavePoliciesSection({ policies }: LeavePoliciesSectionProps) {
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<LeavePolicy | null>(null);
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [loading, setLoading] = React.useState(false);
  const [deleting, setDeleting] = React.useState<string | null>(null);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(policy: LeavePolicy) {
    setEditing(policy);
    setForm({
      name: policy.name,
      type: policy.type,
      days_per_year: policy.days_per_year,
      carry_forward: policy.carry_forward,
      max_carry_forward_days: policy.max_carry_forward_days,
      requires_approval: policy.requires_approval,
    });
    setFormOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const result = editing
      ? await updateLeavePolicy(editing.id, form)
      : await addLeavePolicy(form);
    setLoading(false);
    if (result.success) {
      toast.success(editing ? "Policy updated" : "Policy added");
      setFormOpen(false);
    } else {
      toast.error(result.error);
    }
  }

  async function handleDelete(policy: LeavePolicy) {
    if (!confirm(`Delete "${policy.name}"?`)) return;
    setDeleting(policy.id);
    const result = await deleteLeavePolicy(policy.id);
    setDeleting(null);
    if (result.success) {
      toast.success("Policy deleted");
    } else {
      toast.error(result.error);
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="font-semibold">Leave Policies</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Configure leave types, quotas, and carry-forward rules.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={openAdd}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add Policy
        </Button>
      </div>

      {policies.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-8 text-center">
          <CalendarDays className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No leave policies yet.</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {policies.map((policy) => (
            <div key={policy.id} className="flex items-center gap-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium">{policy.name}</p>
                  <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize", TYPE_COLORS[policy.type])}>
                    {policy.type}
                  </span>
                  {!policy.requires_approval && (
                    <span className="text-xs text-muted-foreground">(no approval needed)</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {policy.days_per_year} days/year
                  {policy.carry_forward
                    ? ` · carry forward up to ${policy.max_carry_forward_days} days`
                    : " · no carry forward"}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(policy)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(policy)}
                  disabled={deleting === policy.id}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialog */}
      <Dialog.Root open={formOpen} onOpenChange={setFormOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-background p-6 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
            <div className="flex items-center justify-between mb-5">
              <Dialog.Title className="text-lg font-semibold">
                {editing ? "Edit Leave Policy" : "Add Leave Policy"}
              </Dialog.Title>
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon"><X className="h-4 w-4" /></Button>
              </Dialog.Close>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label.Root className="text-sm font-medium">Name <span className="text-destructive">*</span></Label.Root>
                  <input
                    className={inputCn}
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Annual Leave"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label.Root className="text-sm font-medium">Type <span className="text-destructive">*</span></Label.Root>
                  <Select.Root
                    value={form.type}
                    onValueChange={(v) => setForm((f) => ({ ...f, type: v as PolicyType }))}
                  >
                    <Select.Trigger className={cn(inputCn, "flex items-center justify-between cursor-pointer")}>
                      <Select.Value />
                      <Select.Icon><ChevronDown className="h-4 w-4 opacity-50" /></Select.Icon>
                    </Select.Trigger>
                    <Select.Portal>
                      <Select.Content className="z-50 max-h-60 min-w-[8rem] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-md">
                        <Select.Viewport className="p-1">
                          {LEAVE_TYPES.map((t) => (
                            <Select.Item key={t.value} value={t.value} className="relative flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent data-[highlighted]:bg-accent">
                              <Select.ItemText>{t.label}</Select.ItemText>
                            </Select.Item>
                          ))}
                        </Select.Viewport>
                      </Select.Content>
                    </Select.Portal>
                  </Select.Root>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label.Root className="text-sm font-medium">Days Per Year <span className="text-destructive">*</span></Label.Root>
                <input
                  type="number"
                  className={inputCn}
                  min={1}
                  max={365}
                  value={form.days_per_year}
                  onChange={(e) => setForm((f) => ({ ...f, days_per_year: Number(e.target.value) }))}
                  required
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  id="carry_forward"
                  type="checkbox"
                  className="h-4 w-4 rounded border-input accent-primary"
                  checked={form.carry_forward}
                  onChange={(e) => setForm((f) => ({ ...f, carry_forward: e.target.checked }))}
                />
                <Label.Root htmlFor="carry_forward" className="text-sm font-medium cursor-pointer">
                  Allow carry forward
                </Label.Root>
              </div>

              {form.carry_forward && (
                <div className="space-y-1.5">
                  <Label.Root className="text-sm font-medium">Max Carry Forward Days</Label.Root>
                  <input
                    type="number"
                    className={inputCn}
                    min={0}
                    max={365}
                    value={form.max_carry_forward_days}
                    onChange={(e) => setForm((f) => ({ ...f, max_carry_forward_days: Number(e.target.value) }))}
                  />
                </div>
              )}

              <div className="flex items-center gap-3">
                <input
                  id="requires_approval"
                  type="checkbox"
                  className="h-4 w-4 rounded border-input accent-primary"
                  checked={form.requires_approval}
                  onChange={(e) => setForm((f) => ({ ...f, requires_approval: e.target.checked }))}
                />
                <Label.Root htmlFor="requires_approval" className="text-sm font-medium cursor-pointer">
                  Requires manager approval
                </Label.Root>
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <Dialog.Close asChild>
                  <Button type="button" variant="outline">Cancel</Button>
                </Dialog.Close>
                <Button type="submit" disabled={loading}>
                  {loading ? "Saving..." : editing ? "Save Changes" : "Add Policy"}
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
