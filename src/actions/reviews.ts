"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin, isManagerOrAbove, getOrgContext } from "@/lib/current-user";
import { getApprovedObjectivesForEmployees } from "@/actions/objectives";
import type { ObjectiveSet } from "@/actions/objectives";
import type { ActionResult } from "@/types";

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
  rating_scale: 3 | 5 | 10;
  objective_period_labels: string[];
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
  rating_scale: z.union([z.literal(3), z.literal(5), z.literal(10)]).default(5),
  objective_period_labels: z.array(z.string()).default([]),
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
    rating_scale: (c.rating_scale as 3 | 5 | 10) ?? 5,
    objective_period_labels: (c.objective_period_labels as string[]) ?? [],
    total_reviews: statsMap[c.id]?.total ?? 0,
    completed_reviews: statsMap[c.id]?.completed ?? 0,
  }));

  return { success: true, data: result };
}

export async function createReviewCycle(
  formData: z.infer<typeof cycleSchema>
): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can create review cycles" };
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
      rating_scale: validated.data.rating_scale,
      objective_period_labels: validated.data.objective_period_labels,
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
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can update cycle status" };

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("review_cycles")
    .update({ status })
    .eq("id", cycleId)
    .eq("org_id", user.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/reviews");
  return { success: true, data: undefined };
}

export async function deleteReviewCycle(cycleId: string): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can delete review cycles" };
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

export async function listCycleReviews(
  cycleId: string,
  roleFilter?: { role: string; employeeId: string | null }
): Promise<ActionResult<ReviewWithDetails[]>> {
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();

  let query = supabase
    .from("reviews")
    .select("*, employees!employee_id(first_name, last_name), reviewers:employees!reviewer_id(first_name, last_name)")
    .eq("cycle_id", cycleId)
    .eq("org_id", ctx.orgId)
    .order("created_at");

  if (roleFilter && roleFilter.employeeId) {
    if (roleFilter.role === "employee") {
      query = query.eq("employee_id", roleFilter.employeeId);
    } else if (roleFilter.role === "manager") {
      query = query.eq("reviewer_id", roleFilter.employeeId);
    }
    // admin/owner: no filter — sees all
  }

  const { data, error } = await query;

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

  const employeeIds = [...new Set(baseReviews.map((r) => r.employee_id))];

  const { data: cycleRow } = await supabase
    .from("review_cycles")
    .select("objective_period_labels")
    .eq("id", cycleId)
    .single();
  const periodLabels: string[] = (cycleRow as any)?.objective_period_labels ?? [];

  const allObjectives = await getApprovedObjectivesForEmployees(ctx.orgId, employeeIds, periodLabels);
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

export type MyReviewWithCycle = ReviewWithDetails & {
  cycle_name: string;
  cycle_start_date: string;
  cycle_end_date: string;
  cycle_rating_scale: 3 | 5 | 10;
};

export async function listMyReviews(): Promise<ActionResult<MyReviewWithCycle[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!user.employeeId) return { success: false, error: "No employee record" };

  const supabase = createAdminSupabase();

  const { data, error } = await supabase
    .from("reviews")
    .select("*, review_cycles(name, start_date, end_date, rating_scale), employees!employee_id(first_name, last_name), reviewers:employees!reviewer_id(first_name, last_name)")
    .eq("employee_id", user.employeeId)
    .eq("org_id", user.orgId)
    .order("created_at", { ascending: false });

  if (error) return { success: false, error: error.message };

  const reviews = (data ?? []).map((r: any) => ({
    id: r.id,
    cycle_id: r.cycle_id,
    cycle_name: r.review_cycles?.name ?? "",
    cycle_start_date: r.review_cycles?.start_date ?? "",
    cycle_end_date: r.review_cycles?.end_date ?? "",
    cycle_rating_scale: (r.review_cycles?.rating_scale as 3 | 5 | 10) ?? 5,
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
    objectives: [],
  }));

  return { success: true, data: reviews };
}

const selfReviewSchema = z.object({
  self_rating: z.number().min(1).max(10),
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
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const validated = selfReviewSchema.safeParse(data);
  if (!validated.success) {
    return { success: false, error: validated.error.errors[0]?.message ?? "Validation failed" };
  }

  const supabase = createAdminSupabase();

  // Verify this review belongs to the calling employee
  const { data: review } = await supabase
    .from("reviews")
    .select("employee_id")
    .eq("id", reviewId)
    .eq("org_id", user.orgId)
    .single();
  if (!review || (review as any).employee_id !== user.employeeId) {
    return { success: false, error: "You can only submit your own self-review" };
  }

  const { error } = await supabase
    .from("reviews")
    .update({
      self_rating: validated.data.self_rating,
      self_comments: validated.data.self_comments,
      goals: validated.data.goals,
      status: "manager_review",
    })
    .eq("id", reviewId)
    .eq("org_id", user.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/reviews");
  return { success: true, data: undefined };
}

const managerReviewSchema = z.object({
  manager_rating: z.number().min(1).max(10),
  manager_comments: z.string().min(1, "Please add your comments"),
  manager_competency_ratings: z.record(z.number()).optional(),
});

export async function submitManagerReview(
  reviewId: string,
  data: z.infer<typeof managerReviewSchema>
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isManagerOrAbove(user.role)) return { success: false, error: "Only managers can submit manager reviews" };

  const validated = managerReviewSchema.safeParse(data);
  if (!validated.success) {
    return { success: false, error: validated.error.errors[0]?.message ?? "Validation failed" };
  }

  const supabase = createAdminSupabase();

  // Verify the caller is the assigned reviewer
  const { data: review } = await supabase
    .from("reviews")
    .select("reviewer_id")
    .eq("id", reviewId)
    .eq("org_id", user.orgId)
    .single();

  if (!review || (review as any).reviewer_id !== user.employeeId) {
    return { success: false, error: "You are not the assigned reviewer for this review" };
  }

  let goalsUpdate: Record<string, any> | undefined;
  if (validated.data.manager_competency_ratings && Object.keys(validated.data.manager_competency_ratings).length > 0) {
    const { data: existingReview } = await supabase
      .from("reviews")
      .select("goals")
      .eq("id", reviewId)
      .eq("org_id", user.orgId)
      .single();

    const raw = (existingReview as any)?.goals;
    const existing = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    goalsUpdate = { ...existing, manager_competency_ratings: validated.data.manager_competency_ratings };
  }

  const { error } = await supabase
    .from("reviews")
    .update({
      manager_rating: validated.data.manager_rating,
      manager_comments: validated.data.manager_comments,
      status: "completed",
      completed_at: new Date().toISOString(),
      ...(goalsUpdate ? { goals: goalsUpdate } : {}),
    })
    .eq("id", reviewId)
    .eq("org_id", user.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/reviews");
  return { success: true, data: undefined };
}
