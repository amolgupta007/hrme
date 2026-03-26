"use client";

import * as React from "react";
import { Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmployeeTable } from "./employee-table";
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
  const [search, setSearch] = React.useState("");
  const [formOpen, setFormOpen] = React.useState(false);
  const [editingEmployee, setEditingEmployee] = React.useState<Employee | null>(null);

  const filtered = employees.filter((emp) => {
    const q = search.toLowerCase();
    return (
      emp.first_name.toLowerCase().includes(q) ||
      emp.last_name.toLowerCase().includes(q) ||
      emp.email.toLowerCase().includes(q) ||
      emp.designation?.toLowerCase().includes(q) ||
      emp.department_name?.toLowerCase().includes(q)
    );
  });

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
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            className="flex h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            placeholder="Search employees..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {canManage && (
          <Button onClick={openAdd}>
            <UserPlus className="mr-2 h-4 w-4" />
            Add Employee
          </Button>
        )}
      </div>

      <div className="text-sm text-muted-foreground">
        {filtered.length} {filtered.length === 1 ? "employee" : "employees"}
        {search && ` matching "${search}"`}
      </div>

      <EmployeeTable
        employees={filtered}
        departments={departments}
        onEdit={canManage ? openEdit : undefined}
        canManage={canManage}
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
