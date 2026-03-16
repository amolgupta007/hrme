"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import type { ActionResult } from "@/types";

const addEmployeeSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  departmentId: z.string().uuid().optional(),
  designation: z.string().optional(),
  dateOfJoining: z.string(),
  employmentType: z.enum(["full_time", "part_time", "contract", "intern"]),
  role: z.enum(["admin", "manager", "employee"]),
});

export async function addEmployee(
  formData: z.infer<typeof addEmployeeSchema>
): Promise<ActionResult<{ id: string }>> {
  const { orgId } = auth();

  if (!orgId) {
    return { success: false, error: "Not authenticated" };
  }

  const validated = addEmployeeSchema.safeParse(formData);
  if (!validated.success) {
    return {
      success: false,
      error: validated.error.errors[0]?.message || "Validation failed",
    };
  }

  const supabase = createServerSupabase();

  // Get internal org_id from Clerk org_id
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id, max_employees")
    .eq("clerk_org_id", orgId)
    .single();

  if (orgError || !org) {
    return { success: false, error: "Organization not found" };
  }

  // Check employee limit
  const { count } = await supabase
    .from("employees")
    .select("*", { count: "exact", head: true })
    .eq("org_id", org.id)
    .eq("status", "active");

  if ((count ?? 0) >= org.max_employees) {
    return {
      success: false,
      error: `Employee limit reached (${org.max_employees}). Upgrade your plan to add more.`,
    };
  }

  const { data, error } = await supabase
    .from("employees")
    .insert({
      org_id: org.id,
      first_name: validated.data.firstName,
      last_name: validated.data.lastName,
      email: validated.data.email,
      phone: validated.data.phone || null,
      department_id: validated.data.departmentId || null,
      designation: validated.data.designation || null,
      date_of_joining: validated.data.dateOfJoining,
      employment_type: validated.data.employmentType,
      role: validated.data.role,
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
  return { success: true, data: { id: data.id } };
}
