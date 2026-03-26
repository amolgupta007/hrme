"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getApprovedObjectivesForEmployees } from "@/actions/objectives";
import type { ObjectiveSet } from "@/actions/objectives";
import type { ActionResult } from "@/types";

// ---- Context helper ----

async function getOrgContext(): Promise<{ orgId: string; clerkUserId: string } | null> {
  const { orgId: sessionOrgId, userId } = auth();
  if (!userId) return null;

  let clerkOrgId = sessionOrgId ?? null;
  if (!clerkOrgId) {
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
  return { orgId: (data as { id: string }).id, clerkUserId: userId };
}

// ---- Types ----

export type ReviewCycleWithStats = {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  status: "draft" | "active" | "completed";
  start_date: string;
  end_date: string;
  created_at: string;
  total_reviews: number;
  completed_reviews: number;
};

export type ReviewWithDetails = {
  id: string;
  cycle_id: string;
  employee_id: string;
  reviewer_id: string;
  employee_name: string;
  reviewer_name: string;
  self_rating: number | null;
  manager_rating: number | null;
  self_comments: string | null;
  manager_comments: string | null;
  goals: { title: string; status: "pending" | "achieved" | "missed" }[];
  status: "pending" | "self_review" | "manager_review" | "completed";
  completed_at: string | null;
  created_at: string;
  objectives: ObjectiveSet[];
};

export type { ObjectiveSet };

// ---- Cycle actions ----

const cycleSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  start_date: z.string().min(1, "Start date is required"),
  end_date: z.string().min(1, "End date is required"),
  employee_ids: z.array(z.string().uuid()).min(1, "Select at least one employee"),
});

export async function listReviewCycles(): Promise<ActionResult<ReviewCycleWithStats[]>> {
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();

  const { data: cycles, error } = await supabase
    .from("review_cycles")
    .select("*")
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false });

  if (error) return { success: false, error: error.message };

  // Get review counts per cycle
  const { data: reviews } = await supabase
    .from("reviews")
    .select("cycle_id, status")
    .eq("org_id", ctx.orgId);

  const statsMap: Record<string, { total: number; completed: number }> = {};
  for (const r of reviews ?? []) {
    const entry = statsMap[r.cycle_id] ?? { total: 0, completed: 0 };
    entry.total++;
    if (r.status === "completed") entry.completed++;
    statsMap[r.cycle_id] = entry;
  }

  const result = (cycles ?? []).map((c: any) => ({
    ...c,
    total_reviews: statsMap[c.id]?.total ?? 0,
    completed_reviews: statsMap[c.id]?.completed ?? 0,
  }));

  return { success: true, data: result };
}

export async function createReviewCycle(
  formData: z.infer<typeof cycleSchema>
): Promise<ActionResult<{ id: string }>> {
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const validated = cycleSchema.safeParse(formData);
  if (!validated.success) {
    return { success: false, error: validated.error.errors[0]?.message ?? "Validation failed" };
  }

  const supabase = createAdminSupabase();

  // Create the cycle
  const { data: cycle, error: cycleError } = await supabase
    .from("review_cycles")
    .insert({
      org_id: ctx.orgId,
      name: validated.data.name,
      description: validated.data.description || null,
      start_date: validated.data.start_date,
      end_date: validated.data.end_date,
      status: "draft",
    })
    .select("id")
    .single();

  if (cycleError || !cycle) return { success: false, error: cycleError?.message ?? "Failed to create cycle" };

  const cycleId = (cycle as { id: string }).id;

  // Look up reviewer (manager/admin) for each employee
  const { data: employees } = await supabase
    .from("employees")
    .select("id, reporting_manager_id")
    .in("id", validated.data.employee_ids)
    .eq("org_id", ctx.orgId);

  // Find the current user's employee record to use as fallback reviewer
  const { data: currentEmployee } = await supabase
    .from("employees")
    .select("id")
    .eq("clerk_user_id", ctx.clerkUserId)
    .eq("org_id", ctx.orgId)
    .single();

  const fallbackReviewerId = currentEmployee
    ? (currentEmployee as { id: string }).id
    : validated.data.employee_ids[0];

  // Create one review record per employee
  const reviewInserts = (employees ?? []).map((emp: any) => ({
    org_id: ctx.orgId,
    cycle_id: cycleId,
    employee_id: emp.id,
    reviewer_id: emp.reporting_manager_id ?? fallbackReviewerId,
    status: "pending" as const,
    goals: [],
  }));

  if (reviewInserts.length > 0) {
    const { error: reviewsError } = await supabase.from("reviews").insert(reviewInserts);
    if (reviewsError) {
      // Clean up cycle if reviews failed
      await supabase.from("review_cycles").delete().eq("id", cycleId);
      return { success: false, error: reviewsError.message };
    }
  }

  revalidatePath("/dashboard/reviews");
  return { success: true, data: { id: cycleId } };
}

export async function updateCycleStatus(
  cycleId: string,
  status: "draft" | "active" | "completed"
): Promise<ActionResult<void>> {
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("review_cycles")
    .update({ status })
    .eq("id", cycleId)
    .eq("org_id", ctx.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/reviews");
  return { success: true, data: undefined };
}

export async function deleteReviewCycle(cycleId: string): Promise<ActionResult<void>> {
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("review_cycles")
    .delete()
    .eq("id", cycleId)
    .eq("org_id", ctx.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/reviews");
  return { success: true, data: undefined };
}

// ---- Review (assessment) actions ----

export async function listCycleReviews(cycleId: string): Promise<ActionResult<ReviewWithDetails[]>> {
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();

  const { data, error } = await supabase
    .from("reviews")
    .select("*, employees!employee_id(first_name, last_name), reviewers:employees!reviewer_id(first_name, last_name)")
    .eq("cycle_id", cycleId)
    .eq("org_id", ctx.orgId)
    .order("created_at");

  if (error) return { success: false, error: error.message };

  const baseReviews = (data ?? []).map((r: any) => ({
    id: r.id,
    cycle_id: r.cycle_id,
    employee_id: r.employee_id,
    reviewer_id: r.reviewer_id,
    employee_name: `${r.employees?.first_name ?? ""} ${r.employees?.last_name ?? ""}`.trim(),
    reviewer_name: `${r.reviewers?.first_name ?? ""} ${r.reviewers?.last_name ?? ""}`.trim(),
    self_rating: r.self_rating,
    manager_rating: r.manager_rating,
    self_comments: r.self_comments,
    manager_comments: r.manager_comments,
    goals: Array.isArray(r.goals) ? r.goals : [],
    status: r.status,
    completed_at: r.completed_at,
    created_at: r.created_at,
  }));

  // Attach approved objectives per employee
  const employeeIds = [...new Set(baseReviews.map((r) => r.employee_id))];
  const allObjectives = await getApprovedObjectivesForEmployees(ctx.orgId, employeeIds);
  const objMap: Record<string, ObjectiveSet[]> = {};
  for (const obj of allObjectives) {
    if (!objMap[obj.employee_id]) objMap[obj.employee_id] = [];
    objMap[obj.employee_id].push(obj);
  }

  const reviews = baseReviews.map((r) => ({
    ...r,
    objectives: objMap[r.employee_id] ?? [],
  }));

  return { success: true, data: reviews };
}

const selfReviewSchema = z.object({
  self_rating: z.number().min(1).max(5),
  self_comments: z.string().min(1, "Please add your comments"),
  goals: z.array(z.object({
    title: z.string().min(1),
    status: z.enum(["pending", "achieved", "missed"]),
  })),
});

export async function submitSelfReview(
  reviewId: string,
  data: z.infer<typeof selfReviewSchema>
): Promise<ActionResult<void>> {
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const validated = selfReviewSchema.safeParse(data);
  if (!validated.success) {
    return { success: false, error: validated.error.errors[0]?.message ?? "Validation failed" };
  }

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("reviews")
    .update({
      self_rating: validated.data.self_rating,
      self_comments: validated.data.self_comments,
      goals: validated.data.goals,
      status: "manager_review",
    })
    .eq("id", reviewId)
    .eq("org_id", ctx.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/reviews");
  return { success: true, data: undefined };
}

const managerReviewSchema = z.object({
  manager_rating: z.number().min(1).max(5),
  manager_comments: z.string().min(1, "Please add your comments"),
});

export async function submitManagerReview(
  reviewId: string,
  data: z.infer<typeof managerReviewSchema>
): Promise<ActionResult<void>> {
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const validated = managerReviewSchema.safeParse(data);
  if (!validated.success) {
    return { success: false, error: validated.error.errors[0]?.message ?? "Validation failed" };
  }

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("reviews")
    .update({
      manager_rating: validated.data.manager_rating,
      manager_comments: validated.data.manager_comments,
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", reviewId)
    .eq("org_id", ctx.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/reviews");
  return { success: true, data: undefined };
}
