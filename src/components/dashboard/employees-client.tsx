"use client";

import * as React from "react";
import * as Select from "@radix-ui/react-select";
import { Search, UserPlus, ChevronDown, Upload, Mail, MailCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmployeeTable, type SortField, type SortDir } from "./employee-table";
import { EmployeeForm } from "./employee-form";
import type { Employee, Department, UserRole } from "@/types";
import { hasPermission } from "@/types";
import { sendBulkInvites } from "@/actions/invites";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { OnboardingTracking } from "./onboarding-tracking";
import type { EmployeeOnboardingSummary } from "@/config/onboarding";

type EmployeeWithDept = Employee & {
  department_name: string | null;
  is_on_leave?: boolean;
  invite_status?: "none" | "sent" | "expired" | null;
};

interface EmployeesClientProps {
  employees: EmployeeWithDept[];
  departments: Department[];
  role: UserRole;
  onboardingData: EmployeeOnboardingSummary[];
}

export function EmployeesClient({ employees, departments, role, onboardingData }: EmployeesClientProps) {
  const canManage = hasPermission(role, "admin");
  const router = useRouter();

  // Search + filter state
  const [search, setSearch] = React.useState("");
  const [deptFilter, setDeptFilter] = React.useState("all");
  const [roleFilter, setRoleFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [activationFilter, setActivationFilter] = React.useState<"all" | "not_activated">("all");

  // Invite state
  const [sendingInvites, setSendingInvites] = React.useState(false);

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
      if (activationFilter === "not_activated" && (emp as EmployeeWithDept).clerk_user_id) return false;
      return true;
    });
  }, [employees, search, deptFilter, roleFilter, statusFilter, activationFilter]);

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

  // Unique department names for filter dropdown
  const deptOptions = React.useMemo(() => {
    const names = [
      ...new Set(employees.map((e) => e.department_name).filter(Boolean) as string[]),
    ].sort();
    return names;
  }, [employees]);

  const hasActiveFilters = deptFilter !== "all" || roleFilter !== "all" || statusFilter !== "all" || activationFilter !== "all";

  function clearFilters() {
    setDeptFilter("all");
    setRoleFilter("all");
    setStatusFilter("all");
    setActivationFilter("all");
  }

  async function handleSendAllInvites() {
    const unactivated = employees.filter((e) => !(e as EmployeeWithDept).clerk_user_id).map((e) => e.id);
    if (unactivated.length === 0) {
      toast.info("All employees already have active accounts");
      return;
    }
    setSendingInvites(true);
    try {
      const result = await sendBulkInvites(unactivated);
      if (result.success) {
        toast.success(`${result.data.sent} invite${result.data.sent !== 1 ? "s" : ""} sent`);
        if (result.data.failed.length > 0) {
          toast.error(`${result.data.failed.length} invite(s) failed`);
        }
      } else {
        toast.error(result.error);
      }
    } finally {
      setSendingInvites(false);
    }
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
    <Tabs defaultValue="directory">
      {/* Only admins/owners see the Onboarding tab */}
      {(role === "admin" || role === "owner") && (
        <TabsList className="mb-2">
          <TabsTrigger value="directory">Directory</TabsTrigger>
          <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
        </TabsList>
      )}

      <TabsContent value="directory">
        <div className="space-y-4">
      {/* Toolbar */}
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
          <button
            onClick={() => setActivationFilter(activationFilter === "not_activated" ? "all" : "not_activated")}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring",
              activationFilter === "not_activated"
                ? "border-amber-500 bg-amber-50 text-amber-700 font-medium dark:bg-amber-950 dark:text-amber-400"
                : "border-input bg-background text-muted-foreground hover:text-foreground"
            )}
          >
            <MailCheck className="h-3.5 w-3.5" />
            Not activated
          </button>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-3 shrink-0">
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {sorted.length} {sorted.length === 1 ? "employee" : "employees"}
            {(search || hasActiveFilters) && employees.length !== sorted.length && ` of ${employees.length}`}
          </span>
          {canManage && (
            <>
              <Button variant="outline" onClick={() => router.push("/dashboard/employees/import")}>
                <Upload className="mr-2 h-4 w-4" />
                Import CSV
              </Button>
              <Button variant="outline" onClick={handleSendAllInvites} disabled={sendingInvites}>
                <Mail className="mr-2 h-4 w-4" />
                {sendingInvites ? "Sending…" : "Send Invites"}
              </Button>
              <Button onClick={openAdd}>
                <UserPlus className="mr-2 h-4 w-4" />
                Add Employee
              </Button>
            </>
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
        </div>
      </TabsContent>

      {(role === "admin" || role === "owner") && (
        <TabsContent value="onboarding">
          <OnboardingTracking data={onboardingData} search={search} />
        </TabsContent>
      )}
    </Tabs>
  );
}

// ---- Filter select ----

const NONE = "__all__";

function FilterSelect({
  value,
  onValueChange,
  placeholder,
  options,
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
