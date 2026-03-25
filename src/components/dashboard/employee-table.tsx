"use client";

import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal, Pencil, UserX, Users } from "lucide-react";
import { toast } from "sonner";
import { cn, formatDate, getInitials } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { terminateEmployee } from "@/actions/employees";
import type { Employee, Department } from "@/types";

type EmployeeWithDept = Employee & { department_name: string | null };

interface EmployeeTableProps {
  employees: EmployeeWithDept[];
  departments: Department[];
  onEdit: (employee: Employee) => void;
}

export function EmployeeTable({ employees, onEdit }: EmployeeTableProps) {
  const [terminating, setTerminating] = React.useState<string | null>(null);

  async function handleTerminate(id: string, name: string) {
    if (!confirm(`Terminate ${name}? This will mark them as terminated.`)) return;
    setTerminating(id);
    const result = await terminateEmployee(id);
    setTerminating(null);
    if (result.success) {
      toast.success(`${name} has been terminated`);
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
          <p className="font-medium">No employees yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add your first team member to get started.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Employee</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Role</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">Department</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden lg:table-cell">Type</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden lg:table-cell">Joined</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
            <th className="px-4 py-3 w-10" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {employees.map((emp) => {
            const fullName = `${emp.first_name} ${emp.last_name}`;
            return (
              <tr key={emp.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                      {getInitials(fullName)}
                    </div>
                    <div>
                      <div className="font-medium">{fullName}</div>
                      <div className="text-xs text-muted-foreground">{emp.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <RoleBadge role={emp.role} />
                </td>
                <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                  {(emp as EmployeeWithDept).department_name ?? "—"}
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground capitalize">
                  {emp.employment_type.replace("_", " ")}
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">
                  {formatDate(emp.date_of_joining)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={emp.status} />
                </td>
                <td className="px-4 py-3">
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
                          onSelect={() => onEdit(emp)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </DropdownMenu.Item>
                        <DropdownMenu.Separator className="my-1 h-px bg-border" />
                        <DropdownMenu.Item
                          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive outline-none hover:bg-destructive/10"
                          onSelect={() => handleTerminate(emp.id, fullName)}
                          disabled={terminating === emp.id}
                        >
                          <UserX className="h-3.5 w-3.5" />
                          {terminating === emp.id ? "Terminating..." : "Terminate"}
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RoleBadge({ role }: { role: Employee["role"] }) {
  const map: Record<Employee["role"], { label: string; className: string }> = {
    owner: { label: "Owner", className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
    admin: { label: "Admin", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
    manager: { label: "Manager", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
    employee: { label: "Employee", className: "bg-muted text-muted-foreground" },
  };
  const { label, className } = map[role] ?? map.employee;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", className)}>
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: Employee["status"] }) {
  const map: Record<Employee["status"], { label: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
    active: { label: "Active", variant: "success" },
    on_leave: { label: "On Leave", variant: "warning" },
    inactive: { label: "Inactive", variant: "secondary" },
    terminated: { label: "Terminated", variant: "destructive" },
  };
  const { label, variant } = map[status] ?? { label: status, variant: "secondary" as const };
  return <Badge variant={variant}>{label}</Badge>;
}
