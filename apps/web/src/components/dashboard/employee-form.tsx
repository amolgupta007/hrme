"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Label from "@radix-ui/react-label";
import * as Select from "@radix-ui/react-select";
import { ChevronDown, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { addEmployee, updateEmployee } from "@/actions/employees";
import type { Employee, Department } from "@/types";

interface EmployeeFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee?: Employee | null;
  departments: Department[];
  employees: Employee[];
}

const EMPTY_FORM = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  departmentId: "",
  designation: "",
  dateOfJoining: new Date().toISOString().split("T")[0],
  employmentType: "full_time" as const,
  role: "employee" as const,
  reportingManagerId: "",
  reportingManager2Id: "",
};

export function EmployeeForm({ open, onOpenChange, employee, departments, employees }: EmployeeFormProps) {
  const isEdit = !!employee;
  const [loading, setLoading] = React.useState(false);
  const [form, setForm] = React.useState(EMPTY_FORM);

  // Populate form when editing
  React.useEffect(() => {
    if (employee) {
      setForm({
        firstName: employee.first_name,
        lastName: employee.last_name,
        email: employee.email ?? "",
        // Stored phone is E.164 (+91XXXXXXXXXX); show just the 10-digit subscriber number.
        phone: (employee.phone ?? "").replace(/\D/g, "").slice(-10),
        departmentId: employee.department_id ?? "",
        designation: employee.designation ?? "",
        dateOfJoining: employee.date_of_joining,
        employmentType: employee.employment_type as typeof EMPTY_FORM.employmentType,
        role: (employee.role === "owner" ? "admin" : employee.role) as typeof EMPTY_FORM.role,
        reportingManagerId: employee.reporting_manager_id ?? "",
        reportingManager2Id: employee.reporting_manager_2_id ?? "",
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [employee, open]);

  function set(field: keyof typeof EMPTY_FORM, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  // Reporting managers must hold a manager/admin role; keep a legacy assignee
  // visible when editing so a previously saved value still renders.
  const managerOptions = React.useMemo(() => {
    const eligible = employees.filter(
      (e) => e.id !== employee?.id && e.role !== "employee"
    );
    for (const id of [employee?.reporting_manager_id, employee?.reporting_manager_2_id]) {
      if (id && id !== employee?.id && !eligible.some((e) => e.id === id)) {
        const legacy = employees.find((e) => e.id === id);
        if (legacy) eligible.push(legacy);
      }
    }
    return eligible;
  }, [employees, employee]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Identity: an employee needs an email OR a phone (phone-only = staff without email).
    const emailVal = form.email.trim();
    const phoneVal = form.phone.trim();
    if (!emailVal && !phoneVal) {
      toast.error("Enter an email or a phone number");
      return;
    }
    // When a phone is given it must be a valid 10-digit Indian mobile (the +91 is added for them).
    if (phoneVal && !/^[6-9]\d{9}$/.test(phoneVal)) {
      toast.error("Enter a valid 10-digit mobile number");
      return;
    }

    setLoading(true);

    const result = isEdit
      ? await updateEmployee(employee.id, form)
      : await addEmployee(form);

    setLoading(false);

    if (result.success) {
      toast.success(isEdit ? "Employee updated" : "Employee added");
      onOpenChange(false);
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl bg-background p-6 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="flex items-center justify-between mb-5">
            <Dialog.Title className="text-lg font-semibold">
              {isEdit ? "Edit Employee" : "Add Employee"}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="First Name" required>
                <input
                  className={inputCn}
                  value={form.firstName}
                  onChange={(e) => set("firstName", e.target.value)}
                  required
                />
              </Field>
              <Field label="Last Name" required>
                <input
                  className={inputCn}
                  value={form.lastName}
                  onChange={(e) => set("lastName", e.target.value)}
                  required
                />
              </Field>
            </div>

            <Field label="Email">
              <input
                type="email"
                className={inputCn}
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="Optional if a phone number is provided"
              />
              <p className="text-xs text-muted-foreground">
                Enter an email or a phone number. Staff without an email sign in by phone.
              </p>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Phone">
                <div className="flex">
                  <span className="inline-flex items-center rounded-l-lg border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
                    +91
                  </span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    className={cn(inputCn, "rounded-l-none")}
                    value={form.phone}
                    onChange={(e) => {
                      // Keep only the 10-digit subscriber number, even if the user
                      // pastes a leading 0 or a 91 / +91 country code.
                      let d = e.target.value.replace(/\D/g, "");
                      if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
                      else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
                      set("phone", d.slice(0, 10));
                    }}
                    placeholder="10-digit mobile"
                  />
                </div>
              </Field>
              <Field label="Date of Joining" required>
                <input
                  type="date"
                  className={inputCn}
                  value={form.dateOfJoining}
                  onChange={(e) => set("dateOfJoining", e.target.value)}
                  required
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Role" required>
                {employee?.role === "owner" ? (
                  // Owner role is immutable here — it only moves via the
                  // Transfer Ownership flow (server enforces this too).
                  <div className={cn(inputCn, "items-center bg-muted/50")} title="Change via Settings → Transfer Ownership">
                    Owner
                  </div>
                ) : (
                  <SelectField
                    value={form.role}
                    onValueChange={(v) => set("role", v)}
                    options={[
                      { value: "employee", label: "Employee" },
                      { value: "manager", label: "Manager" },
                      { value: "admin", label: "Admin" },
                    ]}
                  />
                )}
              </Field>
              <Field label="Employment Type" required>
                <SelectField
                  value={form.employmentType}
                  onValueChange={(v) => set("employmentType", v)}
                  options={[
                    { value: "full_time", label: "Full Time" },
                    { value: "part_time", label: "Part Time" },
                    { value: "contract", label: "Contract" },
                    { value: "intern", label: "Intern" },
                  ]}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Department">
                <SelectField
                  value={form.departmentId}
                  onValueChange={(v) => set("departmentId", v)}
                  placeholder="No department"
                  options={departments.map((d) => ({ value: d.id, label: d.name }))}
                />
              </Field>
              <Field label="Designation">
                <input
                  className={inputCn}
                  value={form.designation}
                  onChange={(e) => set("designation", e.target.value)}
                  placeholder="e.g. Software Engineer"
                />
              </Field>
            </div>

            <Field label="Reporting Manager">
              <SelectField
                value={form.reportingManagerId}
                onValueChange={(v) => {
                  if (v === form.reportingManager2Id) set("reportingManager2Id", "");
                  set("reportingManagerId", v);
                }}
                placeholder="No manager"
                options={managerOptions.map((e) => ({
                  value: e.id,
                  label: `${e.first_name} ${e.last_name}`,
                }))}
              />
            </Field>

            <Field label="Secondary manager (optional)">
              <SelectField
                value={form.reportingManager2Id}
                onValueChange={(v) => set("reportingManager2Id", v)}
                placeholder="No secondary manager"
                options={managerOptions
                  .filter((e) => e.id !== form.reportingManagerId)
                  .map((e) => ({ value: e.id, label: `${e.first_name} ${e.last_name}` }))}
              />
            </Field>

            <div className="flex justify-end gap-3 pt-2">
              <Dialog.Close asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </Dialog.Close>
              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : isEdit ? "Save Changes" : "Add Employee"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ---- Internal helpers ----

const inputCn =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label.Root className="text-sm font-medium leading-none">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label.Root>
      {children}
    </div>
  );
}

const NONE = "__none__";

function SelectField({
  value,
  onValueChange,
  options,
  placeholder = "Select...",
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <Select.Root
      value={value || NONE}
      onValueChange={(v) => onValueChange(v === NONE ? "" : v)}
    >
      <Select.Trigger
        className={cn(
          inputCn,
          "flex items-center justify-between cursor-pointer"
        )}
      >
        <Select.Value placeholder={placeholder} />
        <Select.Icon>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="z-50 max-h-60 min-w-[8rem] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-md">
          <Select.Viewport className="p-1">
            {placeholder && (
              <Select.Item
                value={NONE}
                className="relative flex cursor-pointer select-none items-center rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent data-[highlighted]:bg-accent"
              >
                <Select.ItemText>{placeholder}</Select.ItemText>
              </Select.Item>
            )}
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
