"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/server";
import type { ActionResult, Department } from "@/types";

async function getOrgId(): Promise<string | null> {
  const { orgId, userId } = auth();
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
  return data?.id ?? null;
}

const departmentSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

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

export async function addDepartment(
  formData: z.infer<typeof departmentSchema>
): Promise<ActionResult<{ id: string }>> {
  const orgId = await getOrgId();
  if (!orgId) return { success: false, error: "Not authenticated" };
  const validated = departmentSchema.safeParse(formData);
  if (!validated.success) {
    return { success: false, error: validated.error.errors[0]?.message ?? "Validation failed" };
  }
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("departments")
    .insert({
      org_id: orgId,
      name: validated.data.name,
      description: validated.data.description || null,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { success: false, error: "A department with this name already exists" };
    return { success: false, error: error.message };
  }
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/employees");
  return { success: true, data: { id: data.id } };
}

export async function updateDepartment(
  id: string,
  formData: z.infer<typeof departmentSchema>
): Promise<ActionResult<void>> {
  const orgId = await getOrgId();
  if (!orgId) return { success: false, error: "Not authenticated" };
  const validated = departmentSchema.safeParse(formData);
  if (!validated.success) {
    return { success: false, error: validated.error.errors[0]?.message ?? "Validation failed" };
  }
  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("departments")
    .update({ name: validated.data.name, description: validated.data.description || null })
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) {
    if (error.code === "23505") return { success: false, error: "A department with this name already exists" };
    return { success: false, error: error.message };
  }
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/employees");
  return { success: true, data: undefined };
}

export async function deleteDepartment(id: string): Promise<ActionResult<void>> {
  const orgId = await getOrgId();
  if (!orgId) return { success: false, error: "Not authenticated" };
  const supabase = createAdminSupabase();

  // Check if any employees are assigned
  const { count } = await supabase
    .from("employees")
    .select("*", { count: "exact", head: true })
    .eq("department_id", id)
    .neq("status", "terminated");

  if ((count ?? 0) > 0) {
    return { success: false, error: `Cannot delete — ${count} employee(s) are assigned to this department` };
  }

  const { error } = await supabase
    .from("departments")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId);

  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/employees");
  return { success: true, data: undefined };
}
