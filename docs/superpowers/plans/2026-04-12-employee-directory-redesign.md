# Employee Directory & Org Hierarchy Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the employee admin table and directory views with filters, sortable columns, AlertDialog for terminate, improved cards, and a proper CSS tree org hierarchy.

**Architecture:** Pure client-side UI changes across 4 existing files. No new files, no schema changes, no server action changes. Filter/sort state lives in the client wrapper components. Org tree connectors use CSS borders via Tailwind classes.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind CSS 3.4, Radix UI primitives (already installed: `@radix-ui/react-dialog`, `@radix-ui/react-select`, `@radix-ui/react-dropdown-menu`), `lucide-react`, `sonner`

---

## File Map

| File | Changes |
|------|---------|
| `src/components/dashboard/employee-table.tsx` | Move role badge into Employee cell; employment-type colored tag; sortable column headers; AlertDialog for terminate |
| `src/components/dashboard/employees-client.tsx` | Department / role / status filter state + filter UI; sort state passed to table |
| `src/components/directory/directory-client.tsx` | Department tab filter; larger avatar with status dot; remove email; replace `🏢` emoji; tighter card layout |
| `src/components/directory/org-tree.tsx` | CSS tree connectors (T-shaped); depth-based visual hierarchy; expand-all/collapse-all; search highlight on matching nodes |

---

### Task 1: employee-table — move role badge + employment type tag + header style

**Files:**
- Modify: `src/components/dashboard/employee-table.tsx`

- [ ] **Step 1: Replace the full file content**

```typescript
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
              <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">Department</th>
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
                        <div className="flex items-center gap-2">
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
                    <StatusBadge status={emp.status} />
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

function StatusBadge({ status }: { status: Employee["status"] }) {
  const map: Record<Employee["status"], { label: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
    active:     { label: "Active",     variant: "success" },
    on_leave:   { label: "On Leave",   variant: "warning" },
    inactive:   { label: "Inactive",   variant: "secondary" },
    terminated: { label: "Terminated", variant: "destructive" },
  };
  const { label, variant } = map[status] ?? { label: status, variant: "secondary" as const };
  return <Badge variant={variant}>{label}</Badge>;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | tail -20`
Expected: No TypeScript errors on `employee-table.tsx`. Build may show errors in other files (those are pre-existing).

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/amolg/Downloads/hr-portal" && git add src/components/dashboard/employee-table.tsx && git commit -m "feat: employee table — sortable headers, type tags, role in cell, AlertDialog terminate"
```

---

### Task 2: employees-client — filter state + filter UI + sort wiring

**Files:**
- Modify: `src/components/dashboard/employees-client.tsx`

- [ ] **Step 1: Replace the full file content**

```typescript
"use client";

import * as React from "react";
import * as Select from "@radix-ui/react-select";
import { Search, UserPlus, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmployeeTable, type SortField, type SortDir } from "./employee-table";
import { EmployeeForm } from "./employee-form";
import type { Employee, Department, UserRole } from "@/types";
import { hasPermission } from "@/types";

type EmployeeWithDept = Employee & { department_name: string | null };

interface EmployeesClientProps {
  employees: EmployeeWithDept[];
  departments: Department[];
  role: UserRole;
}

export function EmployeesClient({ employees, departments, role }: EmployeesClientProps) {
  const canManage = hasPermission(role, "admin");

  // Search + filter state
  const [search, setSearch] = React.useState("");
  const [deptFilter, setDeptFilter] = React.useState("all");
  const [roleFilter, setRoleFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");

  // Sort state
  const [sortField, setSortField] = React.useState<SortField>("name");
  const [sortDir, setSortDir] = React.useState<SortDir>("asc");

  // Modal state
  const [formOpen, setFormOpen] = React.useState(false);
  const [editingEmployee, setEditingEmployee] = React.useState<Employee | null>(null);

  // Filter + search
  const filtered = React.useMemo(() => {
    const q = search.toLowerCase();
    return employees.filter((emp) => {
      if (
        q &&
        !emp.first_name.toLowerCase().includes(q) &&
        !emp.last_name.toLowerCase().includes(q) &&
        !emp.email.toLowerCase().includes(q) &&
        !emp.designation?.toLowerCase().includes(q) &&
        !emp.department_name?.toLowerCase().includes(q)
      ) return false;
      if (deptFilter !== "all" && emp.department_name !== deptFilter) return false;
      if (roleFilter !== "all" && emp.role !== roleFilter) return false;
      if (statusFilter !== "all" && emp.status !== statusFilter) return false;
      return true;
    });
  }, [employees, search, deptFilter, roleFilter, statusFilter]);

  // Sort
  const sorted = React.useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av = "", bv = "";
      if (sortField === "name") {
        av = `${a.first_name} ${a.last_name}`.toLowerCase();
        bv = `${b.first_name} ${b.last_name}`.toLowerCase();
      } else if (sortField === "department") {
        av = a.department_name?.toLowerCase() ?? "";
        bv = b.department_name?.toLowerCase() ?? "";
      } else if (sortField === "joined") {
        av = a.date_of_joining;
        bv = b.date_of_joining;
      }
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [filtered, sortField, sortDir]);

  function handleSort(field: SortField) {
    if (field === sortField) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  // Unique department names for filter
  const deptOptions = React.useMemo(() => {
    const names = [...new Set(employees.map((e) => e.department_name).filter(Boolean) as string[])].sort();
    return names;
  }, [employees]);

  const hasActiveFilters = deptFilter !== "all" || roleFilter !== "all" || statusFilter !== "all";

  function clearFilters() {
    setDeptFilter("all");
    setRoleFilter("all");
    setStatusFilter("all");
  }

  function openAdd() {
    setEditingEmployee(null);
    setFormOpen(true);
  }

  function openEdit(employee: Employee) {
    setEditingEmployee(employee);
    setFormOpen(true);
  }

  return (
    <>
      {/* Toolbar row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            className="flex h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            placeholder="Search employees..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <FilterSelect
            value={deptFilter}
            onValueChange={setDeptFilter}
            placeholder="Department"
            options={deptOptions.map((d) => ({ value: d, label: d }))}
          />
          <FilterSelect
            value={roleFilter}
            onValueChange={setRoleFilter}
            placeholder="Role"
            options={[
              { value: "owner", label: "Owner" },
              { value: "admin", label: "Admin" },
              { value: "manager", label: "Manager" },
              { value: "employee", label: "Employee" },
            ]}
          />
          <FilterSelect
            value={statusFilter}
            onValueChange={setStatusFilter}
            placeholder="Status"
            options={[
              { value: "active", label: "Active" },
              { value: "on_leave", label: "On Leave" },
              { value: "inactive", label: "Inactive" },
              { value: "terminated", label: "Terminated" },
            ]}
          />
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {sorted.length} {sorted.length === 1 ? "employee" : "employees"}
            {(search || hasActiveFilters) && ` of ${employees.length}`}
          </span>
          {canManage && (
            <Button onClick={openAdd}>
              <UserPlus className="mr-2 h-4 w-4" />
              Add Employee
            </Button>
          )}
        </div>
      </div>

      <EmployeeTable
        employees={sorted}
        departments={departments}
        onEdit={canManage ? openEdit : undefined}
        canManage={canManage}
        sortField={sortField}
        sortDir={sortDir}
        onSort={handleSort}
      />

      {canManage && (
        <EmployeeForm
          open={formOpen}
          onOpenChange={setFormOpen}
          employee={editingEmployee}
          departments={departments}
          employees={employees}
        />
      )}
    </>
  );
}

// ---- Filter select ----

const NONE = "__all__";

function FilterSelect({
  value, onValueChange, placeholder, options,
}: {
  value: string;
  onValueChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  const isActive = value !== "all";
  return (
    <Select.Root
      value={value === "all" ? NONE : value}
      onValueChange={(v) => onValueChange(v === NONE ? "all" : v)}
    >
      <Select.Trigger
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring",
          isActive
            ? "border-primary bg-primary/5 text-primary font-medium"
            : "border-input bg-background text-muted-foreground hover:text-foreground"
        )}
      >
        <Select.Value placeholder={placeholder} />
        <Select.Icon>
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="z-50 max-h-60 min-w-[8rem] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-md">
          <Select.Viewport className="p-1">
            <Select.Item
              value={NONE}
              className="relative flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent data-[highlighted]:bg-accent"
            >
              <Select.ItemText>All {placeholder}s</Select.ItemText>
            </Select.Item>
            {options.map((opt) => (
              <Select.Item
                key={opt.value}
                value={opt.value}
                className="relative flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent data-[highlighted]:bg-accent"
              >
                <Select.ItemText>{opt.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | tail -20`
Expected: No new TypeScript errors from these two files.

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/amolg/Downloads/hr-portal" && git add src/components/dashboard/employees-client.tsx && git commit -m "feat: employees client — dept/role/status filters, sort state, count in toolbar"
```

---

### Task 3: directory-client — department tabs, bigger avatar, status dot, card tidy-up

**Files:**
- Modify: `src/components/directory/directory-client.tsx`

- [ ] **Step 1: Replace the full file content**

```typescript
"use client";

import * as React from "react";
import { Search, LayoutGrid, GitBranch, Briefcase, Building2, UserCheck } from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
import { OrgTree } from "./org-tree";
import type { DirectoryEmployee } from "@/actions/directory";

interface DirectoryClientProps {
  employees: DirectoryEmployee[];
}

type View = "cards" | "hierarchy";

const ROLE_COLORS: Record<string, string> = {
  owner:    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  admin:    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  manager:  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  employee: "bg-muted text-muted-foreground",
};

// Deterministic color ring per department name
const DEPT_RING_COLORS = [
  "ring-teal-400",
  "ring-blue-400",
  "ring-violet-400",
  "ring-amber-400",
  "ring-rose-400",
  "ring-emerald-400",
];

function deptRingColor(name: string | null): string {
  if (!name) return "ring-border";
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return DEPT_RING_COLORS[h % DEPT_RING_COLORS.length];
}

const STATUS_DOT: Record<string, string> = {
  active:   "bg-emerald-400",
  on_leave: "bg-amber-400",
  inactive: "bg-gray-400",
};

export function DirectoryClient({ employees }: DirectoryClientProps) {
  const [view, setView] = React.useState<View>("cards");
  const [search, setSearch] = React.useState("");
  const [deptFilter, setDeptFilter] = React.useState<string | null>(null);

  // Unique sorted department names
  const departments = React.useMemo(() => {
    const names = [...new Set(employees.map((e) => e.department_name).filter(Boolean) as string[])].sort();
    return names;
  }, [employees]);

  const filtered = employees.filter((e) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      `${e.first_name} ${e.last_name}`.toLowerCase().includes(q) ||
      e.email.toLowerCase().includes(q) ||
      e.designation?.toLowerCase().includes(q) ||
      e.department_name?.toLowerCase().includes(q) ||
      e.manager_name?.toLowerCase().includes(q);
    const matchesDept = !deptFilter || e.department_name === deptFilter;
    return matchesSearch && matchesDept;
  });

  return (
    <div className="space-y-5">
      {/* Top toolbar: search + view toggle + count */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            className="flex h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            placeholder="Search by name, role, department..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center rounded-lg border border-border bg-muted/40 p-1">
          <ViewButton active={view === "cards"} onClick={() => setView("cards")} title="Cards">
            <LayoutGrid className="h-4 w-4" />
          </ViewButton>
          <ViewButton active={view === "hierarchy"} onClick={() => setView("hierarchy")} title="Org Chart">
            <GitBranch className="h-4 w-4" />
          </ViewButton>
        </div>
        <p className="text-sm text-muted-foreground ml-auto shrink-0">
          {filtered.length} {filtered.length === 1 ? "employee" : "employees"}
        </p>
      </div>

      {/* Department filter tabs (cards view only) */}
      {view === "cards" && departments.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <DeptTab active={deptFilter === null} onClick={() => setDeptFilter(null)}>
            All
          </DeptTab>
          {departments.map((dept) => (
            <DeptTab
              key={dept}
              active={deptFilter === dept}
              onClick={() => setDeptFilter(deptFilter === dept ? null : dept)}
            >
              {dept}
            </DeptTab>
          ))}
        </div>
      )}

      {/* Views */}
      {view === "cards" ? (
        filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((emp) => <EmployeeCard key={emp.id} employee={emp} />)}
          </div>
        )
      ) : (
        <OrgTree employees={employees} search={search} />
      )}
    </div>
  );
}

// ---- Employee card ----

function EmployeeCard({ employee: e }: { employee: DirectoryEmployee }) {
  const fullName = `${e.first_name} ${e.last_name}`;
  return (
    <div className="rounded-xl border border-border bg-card p-4 hover:shadow-sm transition-shadow space-y-3">
      {/* Avatar + name + role */}
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <div className={cn(
            "flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-base ring-2",
            deptRingColor(e.department_name)
          )}>
            {getInitials(fullName)}
          </div>
          {/* Status dot */}
          <span className={cn(
            "absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full ring-2 ring-card",
            STATUS_DOT[e.status] ?? "bg-gray-400"
          )} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold truncate">{fullName}</p>
            <span className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize shrink-0",
              ROLE_COLORS[e.role] ?? ROLE_COLORS.employee
            )}>
              {e.role}
            </span>
          </div>
          {e.designation && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{e.designation}</p>
          )}
        </div>
      </div>

      {/* Department */}
      {e.department_name && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Building2 className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{e.department_name}</span>
        </div>
      )}

      {/* Manager */}
      {e.manager_name && (
        <div className="pt-2.5 border-t border-border flex items-center gap-2">
          <UserCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Reports to</span>
          <span className="text-xs font-medium truncate">{e.manager_name}</span>
        </div>
      )}
    </div>
  );
}

// ---- Department tab ----

function DeptTab({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

// ---- View toggle button ----

function ViewButton({ active, onClick, children, title }: {
  active: boolean; onClick: () => void; children: React.ReactNode; title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "rounded-md p-2 transition-colors",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

// ---- Empty state ----

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
      <p className="text-sm text-muted-foreground">No employees match your search or filter.</p>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | tail -20`
Expected: No new TypeScript errors.

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/amolg/Downloads/hr-portal" && git add src/components/directory/directory-client.tsx && git commit -m "feat: directory cards — dept tab filter, larger avatar, status dot, Building2 icon, tighter layout"
```

---

### Task 4: org-tree — CSS tree connectors, depth hierarchy, expand-all, search highlight

**Files:**
- Modify: `src/components/directory/org-tree.tsx`

- [ ] **Step 1: Replace the full file content**

```typescript
"use client";

import * as React from "react";
import { Mail, Briefcase, Users, Minus, Plus } from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
import type { DirectoryEmployee } from "@/actions/directory";

interface OrgTreeProps {
  employees: DirectoryEmployee[];
  search: string;
}

type TreeNode = DirectoryEmployee & { children: TreeNode[] };

function buildTree(employees: DirectoryEmployee[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  for (const e of employees) map.set(e.id, { ...e, children: [] });

  const roots: TreeNode[] = [];
  for (const node of map.values()) {
    if (!node.reporting_manager_id || !map.has(node.reporting_manager_id)) {
      roots.push(node);
    } else {
      map.get(node.reporting_manager_id)!.children.push(node);
    }
  }
  return roots;
}

function matchesSearch(node: TreeNode, q: string): boolean {
  const str = `${node.first_name} ${node.last_name} ${node.email} ${node.designation ?? ""} ${node.department_name ?? ""}`.toLowerCase();
  return str.includes(q);
}

function filterTree(nodes: TreeNode[], q: string): TreeNode[] {
  if (!q) return nodes;
  return nodes.reduce<TreeNode[]>((acc, node) => {
    const filteredChildren = filterTree(node.children, q);
    if (matchesSearch(node, q) || filteredChildren.length > 0) {
      acc.push({ ...node, children: filteredChildren });
    }
    return acc;
  }, []);
}

// Collect all node ids for expand-all / collapse-all
function collectIds(nodes: TreeNode[]): string[] {
  return nodes.flatMap((n) => [n.id, ...collectIds(n.children)]);
}

export function OrgTree({ employees, search }: OrgTreeProps) {
  const roots = buildTree(employees);
  const filtered = filterTree(roots, search.toLowerCase());

  // collapsed set — stores ids of collapsed nodes
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());

  const allIds = React.useMemo(() => collectIds(roots), [roots]);

  function expandAll() { setCollapsed(new Set()); }
  function collapseAll() {
    // Only collapse nodes that have children
    const withChildren = allIds.filter((id) => {
      const find = (nodes: TreeNode[]): TreeNode | undefined => {
        for (const n of nodes) {
          if (n.id === id) return n;
          const found = find(n.children);
          if (found) return found;
        }
      };
      const node = find(roots);
      return node && node.children.length > 0;
    });
    setCollapsed(new Set(withChildren));
  }

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
        <Users className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">No employees match your search.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={expandAll}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
        >
          Expand all
        </button>
        <span className="text-muted-foreground text-xs">·</span>
        <button
          onClick={collapseAll}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
        >
          Collapse all
        </button>
      </div>

      {/* Tree */}
      <div className="space-y-0">
        {filtered.map((node, i) => (
          <TreeNodeRow
            key={node.id}
            node={node}
            depth={0}
            isLast={i === filtered.length - 1}
            collapsed={collapsed}
            onToggle={toggle}
            searchQ={search.toLowerCase()}
          />
        ))}
      </div>
    </div>
  );
}

interface TreeNodeRowProps {
  node: TreeNode;
  depth: number;
  isLast: boolean;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  searchQ: string;
}

function TreeNodeRow({ node, depth, isLast, collapsed, onToggle, searchQ }: TreeNodeRowProps) {
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsed.has(node.id);
  const isMatch = searchQ ? matchesSearch(node, searchQ) : false;

  // Cap visible indentation at depth 4; beyond that we add a "…" indicator instead
  const cappedDepth = Math.min(depth, 4);

  return (
    <div>
      <div className="flex">
        {/* Tree connector area */}
        {depth > 0 && (
          <div
            className="shrink-0 flex"
            style={{ width: cappedDepth * 32 }}
          >
            {/* For each ancestor level, draw either a continuing vertical line or blank */}
            {Array.from({ length: cappedDepth }).map((_, i) => (
              <div
                key={i}
                className={cn("w-8 shrink-0 relative")}
              >
                {/* Vertical connector — only draw for the innermost column on non-last siblings */}
                {i === cappedDepth - 1 ? (
                  <div className="absolute inset-0 flex items-start">
                    {/* Vertical line (top half only if last child) */}
                    <div className={cn(
                      "absolute left-3.5 top-0 w-px bg-border",
                      isLast ? "h-1/2" : "h-full"
                    )} />
                    {/* Horizontal branch to card */}
                    <div className="absolute left-3.5 top-1/2 w-4 h-px bg-border" />
                  </div>
                ) : (
                  // Outer levels: just a continuing vertical line
                  <div className="absolute left-3.5 inset-y-0 w-px bg-border" />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Depth overflow indicator */}
        {depth > 4 && (
          <div className="w-8 shrink-0 flex items-center justify-center text-muted-foreground/50 text-xs">
            ···
          </div>
        )}

        {/* Node card */}
        <div className={cn("flex-1 py-1.5", depth === 0 ? "pb-2" : "")}>
          <EmployeeNodeCard
            node={node}
            depth={depth}
            isCollapsed={isCollapsed}
            isMatch={isMatch}
            searchActive={!!searchQ}
            onToggle={hasChildren ? () => onToggle(node.id) : undefined}
          />
        </div>
      </div>

      {/* Children */}
      {hasChildren && !isCollapsed && (
        <div>
          {node.children.map((child, i) => (
            <TreeNodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              isLast={i === node.children.length - 1}
              collapsed={collapsed}
              onToggle={onToggle}
              searchQ={searchQ}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const ROLE_COLORS: Record<string, string> = {
  owner:    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  admin:    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  manager:  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  employee: "bg-muted text-muted-foreground",
};

function EmployeeNodeCard({
  node, depth, isCollapsed, isMatch, searchActive, onToggle,
}: {
  node: TreeNode;
  depth: number;
  isCollapsed: boolean;
  isMatch: boolean;
  searchActive: boolean;
  onToggle?: () => void;
}) {
  const fullName = `${node.first_name} ${node.last_name}`;
  const isRoot = depth === 0;
  const dimmed = searchActive && !isMatch;

  return (
    <div className={cn(
      "flex items-center gap-3 rounded-xl border bg-card p-3 transition-all",
      isRoot ? "shadow-sm border-border/80" : "border-border",
      isMatch && searchActive ? "ring-2 ring-primary" : "",
      dimmed ? "opacity-40" : "",
      "hover:shadow-sm"
    )}>
      {/* Avatar */}
      <div className={cn(
        "shrink-0 flex items-center justify-center rounded-full bg-primary/10 text-primary font-bold",
        isRoot ? "h-11 w-11 text-sm" : "h-9 w-9 text-xs"
      )}>
        {getInitials(fullName)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={cn("truncate", isRoot ? "font-bold text-sm" : "font-medium text-sm")}>
            {fullName}
          </p>
          <span className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize shrink-0",
            ROLE_COLORS[node.role] ?? ROLE_COLORS.employee
          )}>
            {node.role}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {node.designation && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Briefcase className="h-3 w-3 shrink-0" />
              {node.designation}
            </span>
          )}
          {node.department_name && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3 w-3 shrink-0" />
              {node.department_name}
            </span>
          )}
        </div>
      </div>

      {/* Expand / collapse button */}
      {onToggle && (
        <button
          onClick={onToggle}
          className={cn(
            "shrink-0 flex h-7 w-7 items-center justify-center rounded-full border transition-colors",
            isCollapsed
              ? "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10"
              : "border-border bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
          )}
          title={isCollapsed ? `Expand (${node.children.length} reports)` : "Collapse"}
        >
          {isCollapsed ? <Plus className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | tail -20`
Expected: No new TypeScript errors.

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/amolg/Downloads/hr-portal" && git add src/components/directory/org-tree.tsx && git commit -m "feat: org tree — CSS connectors, depth hierarchy, expand-all/collapse-all, search highlight"
```

---

### Task 5: Final verification

- [ ] **Step 1: Full build check**

Run: `npm run build 2>&1 | grep -E "error|Error" | grep -v "ignoreBuildErrors" | head -20`
Expected: No new errors introduced by these changes.

- [ ] **Step 2: Lint check**

Run: `npm run lint 2>&1 | tail -30`
Expected: No new lint errors.
