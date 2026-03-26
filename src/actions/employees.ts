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

  const employees = (data ?? []).map((e: any) => ({
    ...e,
    department_name: e.departments?.name ?? null,
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
