"use client";

import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import {
  MoreHorizontal, Pencil, UserX, Users,
  ChevronUp, ChevronDown as ChevronDownIcon, ChevronsUpDown,
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatDate, getInitials } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { terminateEmployee } from "@/actions/employees";
import type { Employee, Department } from "@/types";

type EmployeeWithDept = Employee & { department_name: string | null };

export type SortField = "name" | "department" | "joined";
export type SortDir = "asc" | "desc";

interface EmployeeTableProps {
  employees: EmployeeWithDept[];
  departments: Department[];
  onEdit?: (employee: Employee) => void;
  canManage?: boolean;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
}

export function EmployeeTable({
  employees, onEdit, canManage = false,
  sortField, sortDir, onSort,
}: EmployeeTableProps) {
  const [terminating, setTerminating] = React.useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = React.useState<{ id: string; name: string } | null>(null);

  async function handleTerminate() {
    if (!confirmTarget) return;
    setTerminating(confirmTarget.id);
    const result = await terminateEmployee(confirmTarget.id);
    setTerminating(null);
    setConfirmTarget(null);
    if (result.success) {
      toast.success(`${confirmTarget.name} has been terminated`);
    } else {
      toast.error(result.error);
    }
  }

  if (employees.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Users className="h-7 w-7 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium">No employees found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try adjusting your search or filters.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/60">
              <SortHeader field="name" current={sortField} dir={sortDir} onSort={onSort} className="px-4 py-3">
                Employee
              </SortHeader>
              <SortHeader field="department" current={sortField} dir={sortDir} onSort={onSort} className="px-4 py-3 hidden md:table-cell">
                Department
              </SortHeader>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden lg:table-cell">Type</th>
              <SortHeader field="joined" current={sortField} dir={sortDir} onSort={onSort} className="px-4 py-3 hidden lg:table-cell">
                Joined
              </SortHeader>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {employees.map((emp) => {
              const fullName = `${emp.first_name} ${emp.last_name}`;
              return (
                <tr key={emp.id} className="hover:bg-muted/30 transition-colors">
                  {/* Employee: avatar + name + email + role badge */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                        {getInitials(fullName)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{fullName}</span>
                          <RoleBadge role={emp.role} />
                        </div>
                        <div className="text-xs text-muted-foreground">{emp.email}</div>
                      </div>
                    </div>
                  </td>
                  {/* Department */}
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                    {(emp as EmployeeWithDept).department_name ?? "—"}
                  </td>
                  {/* Employment type tag */}
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <EmploymentTypeTag type={emp.employment_type} />
                  </td>
                  {/* Joined */}
                  <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">
                    {formatDate(emp.date_of_joining)}
                  </td>
                  {/* Status */}
                  <td className="px-4 py-3">
                    <StatusBadge status={emp.status} isOnLeave={(emp as any).is_on_leave} />
                  </td>
                  {/* Actions */}
                  <td className="px-4 py-3">
                    {canManage && (
                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.Content
                            align="end"
                            className="z-50 min-w-[140px] overflow-hidden rounded-lg border bg-popover p-1 shadow-md"
                          >
                            <DropdownMenu.Item
                              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent"
                              onSelect={() => onEdit?.(emp)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </DropdownMenu.Item>
                            <DropdownMenu.Separator className="my-1 h-px bg-border" />
                            <DropdownMenu.Item
                              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive outline-none hover:bg-destructive/10"
                              onSelect={() => setConfirmTarget({ id: emp.id, name: fullName })}
                            >
                              <UserX className="h-3.5 w-3.5" />
                              Terminate
                            </DropdownMenu.Item>
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Root>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Terminate confirmation dialog */}
      <AlertDialog.Root open={!!confirmTarget} onOpenChange={(open) => { if (!open) setConfirmTarget(null); }}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/50 animate-in fade-in-0" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-background p-6 shadow-lg animate-in fade-in-0 zoom-in-95">
            <AlertDialog.Title className="text-lg font-semibold">
              Terminate {confirmTarget?.name}?
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
              This will mark them as terminated. They will lose access to the portal. This action can be reversed by editing the employee record.
            </AlertDialog.Description>
            <div className="mt-5 flex justify-end gap-3">
              <AlertDialog.Cancel asChild>
                <Button variant="outline">Cancel</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button
                  variant="destructive"
                  onClick={handleTerminate}
                  disabled={!!terminating}
                >
                  {terminating ? "Terminating..." : "Terminate"}
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}

// ---- Sort header ----

function SortHeader({
  field, current, dir, onSort, children, className,
}: {
  field: SortField; current: SortField; dir: SortDir;
  onSort: (f: SortField) => void; children: React.ReactNode; className?: string;
}) {
  const active = current === field;
  return (
    <th className={cn("text-left font-medium text-muted-foreground", className)}>
      <button
        onClick={() => onSort(field)}
        className="flex items-center gap-1 hover:text-foreground transition-colors"
      >
        {children}
        {active ? (
          dir === "asc" ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDownIcon className="h-3.5 w-3.5" />
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
        )}
      </button>
    </th>
  );
}

// ---- Employment type tag ----

const TYPE_STYLES: Record<string, string> = {
  full_time: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  part_time: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  contract:  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  intern:    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
};

const TYPE_LABELS: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract:  "Contract",
  intern:    "Intern",
};

function EmploymentTypeTag({ type }: { type: string }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
      TYPE_STYLES[type] ?? "bg-muted text-muted-foreground"
    )}>
      {TYPE_LABELS[type] ?? type.replace("_", " ")}
    </span>
  );
}

// ---- Role badge ----

function RoleBadge({ role }: { role: Employee["role"] }) {
  const map: Record<Employee["role"], { label: string; className: string }> = {
    owner:    { label: "Owner",    className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
    admin:    { label: "Admin",    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
    manager:  { label: "Manager",  className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
    employee: { label: "Employee", className: "bg-muted text-muted-foreground" },
  };
  const { label, className } = map[role] ?? map.employee;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", className)}>
      {label}
    </span>
  );
}

// ---- Status badge ----

function StatusBadge({ status, isOnLeave }: { status: Employee["status"]; isOnLeave?: boolean }) {
  const displayStatus = isOnLeave && status === "active" ? "on_leave" : status;
  const map: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
    active:     { label: "Active",     variant: "success" },
    on_leave:   { label: "On Leave",   variant: "warning" },
    inactive:   { label: "Inactive",   variant: "secondary" },
    terminated: { label: "Terminated", variant: "destructive" },
  };
  const { label, variant } = map[displayStatus] ?? { label: displayStatus, variant: "secondary" as const };
  return <Badge variant={variant}>{label}</Badge>;
}
