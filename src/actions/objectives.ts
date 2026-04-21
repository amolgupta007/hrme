"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isManagerOrAbove, getOrgContext } from "@/lib/current-user";
import type { ActionResult } from "@/types";


// ---- Types ----

export type ObjectiveItem = {
  id: string;
  title: string;
  description: string;
  success_criteria: string;
  weight: number;
  // Self-evaluation (filled during self-review)
  self_progress: number | null;
  self_status: "on_track" | "achieved" | "partially_achieved" | "missed" | null;
  self_comment: string | null;
  // Manager evaluation (filled during manager review)
  manager_rating: number | null;
  manager_comment: string | null;
};

export type ObjectiveSet = {
  id: string;
  org_id: string;
  employee_id: string;
  manager_id: string | null;
  cycle_id: string | null;
  period_type: "quarterly" | "yearly";
  period_label: string;
  status: "draft" | "submitted" | "approved" | "rejected";
  items: ObjectiveItem[];
  manager_feedback: string | null;
  employee_name: string;
  manager_name: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  created_at: string;
};

// ---- Internal helpers ----

function mapObjectives(data: any[]): ObjectiveSet[] {
  return data.map((o: any) => ({
    id: o.id,
    org_id: o.org_id,
    employee_id: o.employee_id,
    manager_id: o.manager_id,
    cycle_id: o.cycle_id,
    period_type: o.period_type,
    period_label: o.period_label,
    status: o.status,
    items: Array.isArray(o.items) ? o.items : [],
    manager_feedback: o.manager_feedback,
    employee_name: `${o.employees?.first_name ?? ""} ${o.employees?.last_name ?? ""}`.trim(),
    manager_name: o.managers
      ? `${o.managers?.first_name ?? ""} ${o.managers?.last_name ?? ""}`.trim()
      : null,
    submitted_at: o.submitted_at,
    approved_at: o.approved_at,
    created_at: o.created_at,
  }));
}

const OBJ_SELECT =
  "*, employees!employee_id(first_name, last_name), managers:employees!manager_id(first_name, last_name)";

// ---- Validation ----

const itemSchema = z.object({
  id: z.string(),
  title: z.string().min(1, "Title is required"),
  description: z.string().default(""),
  success_criteria: z.string().default(""),
  weight: z.number().min(1).max(100),
  self_progress: z.number().nullable().default(null),
  self_status: z
    .enum(["on_track", "achieved", "partially_achieved", "missed"])
    .nullable()
    .default(null),
  self_comment: z.string().nullable().default(null),
  manager_rating: z.number().nullable().default(null),
  manager_comment: z.string().nullable().default(null),
});

const createSchema = z.object({
  period_type: z.enum(["quarterly", "yearly"]),
  period_label: z.string().min(1),
  items: z.array(itemSchema).min(1, "Add at least one objective"),
});

// ---- List actions ----

export async function listMyObjectives(): Promise<ActionResult<ObjectiveSet[]>> {
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();

  const { data: emp } = await supabase
    .from("employees")
    .select("id")
    .eq("clerk_user_id", ctx.clerkUserId)
    .eq("org_id", ctx.orgId)
    .single();

  if (!emp) return { success: false, error: "Employee record not found" };

  const { data, error } = await supabase
    .from("objectives")
    .select(OBJ_SELECT)
    .eq("employee_id", (emp as { id: string }).id)
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, data: mapObjectives(data ?? []) };
}

export async function listPendingApprovals(): Promise<ActionResult<ObjectiveSet[]>> {
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();

  const { data: emp } = await supabase
    .from("employees")
    .select("id")
    .eq("clerk_user_id", ctx.clerkUserId)
    .eq("org_id", ctx.orgId)
    .single();

  if (!emp) return { success: false, error: "Employee record not found" };

  const { data, error } = await supabase
    .from("objectives")
    .select(OBJ_SELECT)
    .eq("manager_id", (emp as { id: string }).id)
    .eq("org_id", ctx.orgId)
    .eq("status", "submitted")
    .order("submitted_at", { ascending: true });

  if (error) return { success: false, error: error.message };
  return { success: true, data: mapObjectives(data ?? []) };
}

export async function listAllObjectives(): Promise<ActionResult<ObjectiveSet[]>> {
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("objectives")
    .select(OBJ_SELECT)
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, data: mapObjectives(data ?? []) };
}

export async function getApprovedObjectivesForEmployees(
  orgId: string,
  employeeIds: string[]
): Promise<ObjectiveSet[]> {
  if (employeeIds.length === 0) return [];
  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from("objectives")
    .select(OBJ_SELECT)
    .in("employee_id", employeeIds)
    .eq("org_id", orgId)
    .eq("status", "approved");
  return mapObjectives(data ?? []);
}

// ---- Mutation actions ----

export async function createObjectiveSet(
  formData: z.infer<typeof createSchema>
): Promise<ActionResult<{ id: string }>> {
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const validated = createSchema.safeParse(formData);
  if (!validated.success) {
    return { success: false, error: validated.error.errors[0]?.message ?? "Validation failed" };
  }

  const totalWeight = validated.data.items.reduce((s, i) => s + i.weight, 0);
  if (totalWeight !== 100) {
    return {
      success: false,
      error: `Objective weights must sum to 100% (currently ${totalWeight}%)`,
    };
  }

  const supabase = createAdminSupabase();

  const { data: emp } = await supabase
    .from("employees")
    .select("id, reporting_manager_id")
    .eq("clerk_user_id", ctx.clerkUserId)
    .eq("org_id", ctx.orgId)
    .single();

  if (!emp) return { success: false, error: "Employee record not found" };
  const empData = emp as { id: string; reporting_manager_id: string | null };

  const { data, error } = await supabase
    .from("objectives")
    .insert({
      org_id: ctx.orgId,
      employee_id: empData.id,
      manager_id: empData.reporting_manager_id,
      period_type: validated.data.period_type,
      period_label: validated.data.period_label,
      items: validated.data.items,
      status: "draft",
    })
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? "Failed to create objectives" };
  }

  revalidatePath("/dashboard/objectives");
  return { success: true, data: { id: (data as { id: string }).id } };
}

export async function updateObjectiveSet(
  id: string,
  formData: z.infer<typeof createSchema>
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!user.employeeId) return { success: false, error: "No employee record" };

  const validated = createSchema.safeParse(formData);
  if (!validated.success) {
    return { success: false, error: validated.error.errors[0]?.message ?? "Validation failed" };
  }

  const totalWeight = validated.data.items.reduce((s, i) => s + i.weight, 0);
  if (totalWeight !== 100) {
    return { success: false, error: `Objective weights must sum to 100% (currently ${totalWeight}%)` };
  }

  const supabase = createAdminSupabase();

  // Ownership check
  const { data: row } = await supabase
    .from("objectives")
    .select("employee_id")
    .eq("id", id)
    .eq("org_id", user.orgId)
    .single();

  if (!row || (row as any).employee_id !== user.employeeId) {
    return { success: false, error: "Not authorised" };
  }

  const { error } = await supabase
    .from("objectives")
    .update({
      period_type: validated.data.period_type,
      period_label: validated.data.period_label,
      items: validated.data.items,
      status: "draft",
    })
    .eq("id", id)
    .eq("org_id", user.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/objectives");
  return { success: true, data: undefined };
}

export async function submitObjectives(objectiveId: string): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!user.employeeId) return { success: false, error: "No employee record" };

  const supabase = createAdminSupabase();

  // Ownership check
  const { data: row } = await supabase
    .from("objectives")
    .select("employee_id")
    .eq("id", objectiveId)
    .eq("org_id", user.orgId)
    .single();

  if (!row || (row as any).employee_id !== user.employeeId) {
    return { success: false, error: "Not authorised" };
  }

  const { error } = await supabase
    .from("objectives")
    .update({ status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", objectiveId)
    .eq("org_id", user.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/objectives");
  return { success: true, data: undefined };
}

export async function approveObjectives(
  objectiveId: string,
  feedback?: string
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isManagerOrAbove(user.role)) return { success: false, error: "Only managers can approve objectives" };

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("objectives")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      manager_feedback: feedback ?? null,
    })
    .eq("id", objectiveId)
    .eq("org_id", user.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/objectives");
  return { success: true, data: undefined };
}

export async function rejectObjectives(
  objectiveId: string,
  feedback: string
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isManagerOrAbove(user.role)) return { success: false, error: "Only managers can reject objectives" };

  if (!feedback.trim()) return { success: false, error: "Feedback is required for rejection" };

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("objectives")
    .update({ status: "rejected", manager_feedback: feedback })
    .eq("id", objectiveId)
    .eq("org_id", user.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/objectives");
  return { success: true, data: undefined };
}

export async function updateObjectiveItems(
  objectiveId: string,
  items: ObjectiveItem[]
): Promise<ActionResult<void>> {
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("objectives")
    .update({ items })
    .eq("id", objectiveId)
    .eq("org_id", ctx.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/objectives");
  revalidatePath("/dashboard/reviews");
  return { success: true, data: undefined };
}

export async function deleteObjectiveSet(objectiveId: string): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!user.employeeId) return { success: false, error: "No employee record" };

  const supabase = createAdminSupabase();

  // Ownership check
  const { data: row } = await supabase
    .from("objectives")
    .select("employee_id")
    .eq("id", objectiveId)
    .eq("org_id", user.orgId)
    .single();

  if (!row || (row as any).employee_id !== user.employeeId) {
    return { success: false, error: "Not authorised" };
  }

  const { error } = await supabase
    .from("objectives")
    .delete()
    .eq("id", objectiveId)
    .eq("org_id", user.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/objectives");
  return { success: true, data: undefined };
}

export async function getPendingObjectivesCount(orgId: string, clerkUserId: string): Promise<number> {
  const supabase = createAdminSupabase();

  const { data: emp } = await supabase
    .from("employees")
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .eq("org_id", orgId)
    .single();

  if (!emp) return 0;

  const { count } = await supabase
    .from("objectives")
    .select("*", { count: "exact", head: true })
    .eq("manager_id", (emp as { id: string }).id)
    .eq("org_id", orgId)
    .eq("status", "submitted");

  return count ?? 0;
}
