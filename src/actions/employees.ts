"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import type { ActionResult, Employee, Department } from "@/types";

// ---- Helpers ----

/** Returns the internal Supabase org UUID and the Clerk org ID for the current user. */
async function getOrgIds(): Promise<{ internalOrgId: string; clerkOrgId: string } | null> {
  const { orgId, userId } = auth();

  // Resolve Clerk org ID — prefer session orgId, fall back to membership lookup
  let clerkOrgId = orgId ?? null;

  if (!clerkOrgId) {
    if (!userId) return null;
    const client = await clerkClient();
    const memberships = await client.users.getOrganizationMembershipList({ userId });
    clerkOrgId = memberships.data[0]?.organization.id ?? null;
  }

  if (!clerkOrgId) return null;

  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from("organizations")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (!data) return null;
  return { internalOrgId: (data as { id: string }).id, clerkOrgId };
}

/** Convenience wrapper — returns just the internal Supabase org UUID. */
async function getOrgId(): Promise<string | null> {
  const ids = await getOrgIds();
  return ids?.internalOrgId ?? null;
}

// ---- Schemas ----

const employeeSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  departmentId: z.string().uuid().optional().or(z.literal("")),
  designation: z.string().optional(),
  dateOfJoining: z.string().min(1, "Date of joining is required"),
  employmentType: z.enum(["full_time", "part_time", "contract", "intern"]),
  role: z.enum(["admin", "manager", "employee"]),
  reportingManagerId: z.string().uuid().optional().or(z.literal("")),
});

// ---- Actions ----

export async function listEmployees(): Promise<
  ActionResult<(Employee & { department_name: string | null })[]>
> {
  const orgId = await getOrgId();
  if (!orgId) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("employees")
    .select("*, departments!department_id(name)")
    .eq("org_id", orgId)
    .neq("status", "terminated")
    .order("created_at", { ascending: false });
  if (error) return { success: false, error: error.message };

  const today = new Date().toISOString().split("T")[0];
  const { data: onLeaveData } = await supabase
    .from("leave_requests")
    .select("employee_id")
    .eq("org_id", orgId)
    .eq("status", "approved")
    .lte("start_date", today)
    .gte("end_date", today);

  const onLeaveSet = new Set((onLeaveData ?? []).map((r: any) => r.employee_id));

  const employees = (data ?? []).map((e: any) => ({
    ...e,
    department_name: e.departments?.name ?? null,
    is_on_leave: onLeaveSet.has(e.id),
  }));

  return { success: true, data: employees };
}

export async function listDepartments(): Promise<ActionResult<Department[]>> {
  const orgId = await getOrgId();
  if (!orgId) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("departments")
    .select("*")
    .eq("org_id", orgId)
    .order("name");

  if (error) return { success: false, error: error.message };
  return { success: true, data: data ?? [] };
}

export async function addEmployee(
  formData: z.infer<typeof employeeSchema>
): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can add employees" };
  const ids = await getOrgIds();
  if (!ids) return { success: false, error: "Not authenticated" };

  const validated = employeeSchema.safeParse(formData);
  if (!validated.success) {
    return { success: false, error: validated.error.errors[0]?.message ?? "Validation failed" };
  }

  const supabase = createAdminSupabase();

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id, max_employees")
    .eq("clerk_org_id", ids.clerkOrgId)
    .single();

  if (orgError || !org) return { success: false, error: "Organization not found" };

  const typedOrg = org as { id: string; max_employees: number };

  const { count } = await supabase
    .from("employees")
    .select("*", { count: "exact", head: true })
    .eq("org_id", typedOrg.id)
    .eq("status", "active");

  if ((count ?? 0) >= typedOrg.max_employees) {
    return {
      success: false,
      error: `Employee limit reached (${typedOrg.max_employees}). Upgrade your plan to add more.`,
    };
  }

  const { data, error } = await supabase
    .from("employees")
    .insert({
      org_id: typedOrg.id,
      first_name: validated.data.firstName,
      last_name: validated.data.lastName,
      email: validated.data.email,
      phone: validated.data.phone || null,
      department_id: validated.data.departmentId || null,
      designation: validated.data.designation || null,
      date_of_joining: validated.data.dateOfJoining,
      employment_type: validated.data.employmentType,
      role: validated.data.role,
      reporting_manager_id: validated.data.reportingManagerId || null,
      status: "active",
      metadata: {},
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "An employee with this email already exists" };
    }
    return { success: false, error: error.message };
  }

  // Send Clerk org invitation so the employee can sign in and access the dashboard
  try {
    const client = await clerkClient();
    await client.organizations.createOrganizationInvitation({
      organizationId: ids.clerkOrgId,
      emailAddress: validated.data.email,
      role: "org:member",
      redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://jambahr.com"}/dashboard`,
    });
  } catch (inviteErr: any) {
    // Invitation failure is non-fatal — employee record is created, invite can be resent manually
    console.warn("Clerk invitation failed (non-fatal):", inviteErr?.message ?? inviteErr);
  }

  revalidatePath("/dashboard/employees");
  return { success: true, data: { id: (data as { id: string }).id } };
}

export async function updateEmployee(
  id: string,
  formData: z.infer<typeof employeeSchema>
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can update employees" };
  const orgId = await getOrgId();
  if (!orgId) return { success: false, error: "Not authenticated" };

  const validated = employeeSchema.safeParse(formData);
  if (!validated.success) {
    return { success: false, error: validated.error.errors[0]?.message ?? "Validation failed" };
  }

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("employees")
    .update({
      first_name: validated.data.firstName,
      last_name: validated.data.lastName,
      email: validated.data.email,
      phone: validated.data.phone || null,
      department_id: validated.data.departmentId || null,
      designation: validated.data.designation || null,
      date_of_joining: validated.data.dateOfJoining,
      employment_type: validated.data.employmentType,
      role: validated.data.role,
      reporting_manager_id: validated.data.reportingManagerId || null,
    })
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "An employee with this email already exists" };
    }
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/employees");
  return { success: true, data: undefined };
}

export async function terminateEmployee(id: string): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can terminate employees" };
  const orgId = await getOrgId();
  if (!orgId) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("employees")
    .update({ status: "terminated" })
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/employees");
  return { success: true, data: undefined };
}

export type ImportRow = {
  first_name: string;
  last_name: string;
  email: string;
  role: "admin" | "manager" | "employee";
  employment_type: "full_time" | "part_time" | "contract" | "intern";
  date_of_joining: string;
  phone?: string;
  department?: string;
  designation?: string;
  date_of_birth?: string;
  reporting_manager_email?: string;
};

export type ImportResult = {
  imported: number;
  skipped: number;
  errors: { row: number; reason: string; data: ImportRow }[];
};

export async function bulkImportEmployees(
  rows: ImportRow[]
): Promise<ActionResult<ImportResult>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };

  const orgId = user.orgId;
  if (!orgId) return { success: false, error: "Organization not found" };

  const supabase = createAdminSupabase();

  // Fetch plan limit
  const { data: org } = await supabase
    .from("organizations")
    .select("max_employees")
    .eq("id", orgId)
    .single();
  const maxEmployees = (org as any)?.max_employees ?? 10;

  // Fetch current active count
  const { count: currentCount } = await supabase
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .neq("status", "terminated");
  const activeCount = currentCount ?? 0;

  const remainingSlots = maxEmployees - activeCount;

  // Fetch existing emails in org (for duplicate detection)
  const { data: existingEmps } = await supabase
    .from("employees")
    .select("email, status")
    .eq("org_id", orgId);
  const existingEmailMap = new Map(
    (existingEmps ?? []).map((e: any) => [e.email.toLowerCase(), e.status])
  );

  // Fetch departments (for name→id lookup)
  const { data: depts } = await supabase
    .from("departments")
    .select("id, name")
    .eq("org_id", orgId);
  const deptMap = new Map(
    (depts ?? []).map((d: any) => [d.name.toLowerCase(), d.id])
  );

  // Fetch existing employees for reporting_manager_email lookup
  const { data: managers } = await supabase
    .from("employees")
    .select("id, email")
    .eq("org_id", orgId)
    .neq("status", "terminated");
  const managerEmailMap = new Map(
    (managers ?? []).map((m: any) => [m.email.toLowerCase(), m.id])
  );

  const errors: ImportResult["errors"] = [];
  const toInsert: any[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;

    if (!row.first_name?.trim()) {
      errors.push({ row: rowNum, reason: "Missing first_name", data: row });
      continue;
    }
    if (!row.last_name?.trim()) {
      errors.push({ row: rowNum, reason: "Missing last_name", data: row });
      continue;
    }
    if (!row.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
      errors.push({ row: rowNum, reason: "Missing or invalid email", data: row });
      continue;
    }
    if (!["admin", "manager", "employee"].includes(row.role)) {
      errors.push({ row: rowNum, reason: `Invalid role "${row.role}" — must be admin, manager, or employee`, data: row });
      continue;
    }
    if (!["full_time", "part_time", "contract", "intern"].includes(row.employment_type)) {
      errors.push({ row: rowNum, reason: `Invalid employment_type "${row.employment_type}"`, data: row });
      continue;
    }
    if (!row.date_of_joining || !/^\d{4}-\d{2}-\d{2}$/.test(row.date_of_joining)) {
      errors.push({ row: rowNum, reason: "Missing or invalid date_of_joining (use YYYY-MM-DD)", data: row });
      continue;
    }

    const emailLower = row.email.toLowerCase();
    const existingStatus = existingEmailMap.get(emailLower);
    if (existingStatus === "terminated") {
      errors.push({ row: rowNum, reason: "Email belongs to a terminated employee — re-activate manually", data: row });
      continue;
    }
    if (existingStatus) {
      errors.push({ row: rowNum, reason: "Email already exists in this organization", data: row });
      continue;
    }

    if (toInsert.length >= remainingSlots) {
      errors.push({ row: rowNum, reason: `Plan limit reached (${maxEmployees} employees). Upgrade to import more.`, data: row });
      continue;
    }

    const departmentId = row.department
      ? (deptMap.get(row.department.toLowerCase()) ?? null)
      : null;
    const reportingManagerId = row.reporting_manager_email
      ? (managerEmailMap.get(row.reporting_manager_email.toLowerCase()) ?? null)
      : null;

    toInsert.push({
      org_id: orgId,
      first_name: row.first_name.trim(),
      last_name: row.last_name.trim(),
      email: row.email.toLowerCase().trim(),
      role: row.role,
      employment_type: row.employment_type,
      date_of_joining: row.date_of_joining,
      phone: row.phone?.trim() || null,
      department_id: departmentId,
      designation: row.designation?.trim() || null,
      date_of_birth: row.date_of_birth && /^\d{4}-\d{2}-\d{2}$/.test(row.date_of_birth)
        ? row.date_of_birth
        : null,
      reporting_manager_id: reportingManagerId,
      status: "active",
    });
  }

  if (toInsert.length > 0) {
    const { error: insertError } = await supabase.from("employees").insert(toInsert);
    if (insertError) {
      return { success: false, error: insertError.message };
    }
  }

  revalidatePath("/dashboard/employees");

  return {
    success: true,
    data: {
      imported: toInsert.length,
      skipped: errors.length,
      errors,
    },
  };
}
