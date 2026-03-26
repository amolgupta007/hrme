"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import type { ActionResult } from "@/types";

async function getOrgContext() {
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

export type Course = {
  id: string;
  org_id: string;
  title: string;
  description: string | null;
  category: "ethics" | "compliance" | "safety" | "skills" | "onboarding" | "custom";
  content_url: string | null;
  duration_minutes: number | null;
  is_mandatory: boolean;
  due_date: string | null;
  created_at: string;
  total_enrolled: number;
  completed_count: number;
  overdue_count: number;
};

export type Enrollment = {
  id: string;
  course_id: string;
  employee_id: string;
  course_title: string;
  course_description: string | null;
  course_category: string;
  course_is_mandatory: boolean;
  course_due_date: string | null;
  course_content_url: string | null;
  course_duration_minutes: number | null;
  employee_name: string;
  status: "assigned" | "in_progress" | "completed" | "overdue";
  progress_percent: number;
  completed_at: string | null;
  certificate_url: string | null;
  created_at: string;
};

// ---- Schemas ----

const courseSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  category: z.enum(["ethics", "compliance", "safety", "skills", "onboarding", "custom"]),
  content_url: z.string().url("Enter a valid URL").optional().or(z.literal("")),
  duration_minutes: z.number().int().positive().optional().nullable(),
  is_mandatory: z.boolean().default(false),
  due_date: z.string().optional().nullable(),
});

const progressSchema = z.object({
  progress_percent: z.number().int().min(0).max(100),
  status: z.enum(["assigned", "in_progress", "completed", "overdue"]),
  certificate_url: z.string().url().optional().or(z.literal("")).nullable(),
});

// ---- Course actions ----

export async function listCourses(): Promise<ActionResult<Course[]>> {
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();

  const { data: courses, error } = await supabase
    .from("training_courses")
    .select("*")
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false });

  if (error) return { success: false, error: error.message };

  // Get enrollment stats per course
  const { data: enrollments } = await supabase
    .from("training_enrollments")
    .select("course_id, status")
    .eq("org_id", ctx.orgId);

  const statsMap: Record<string, { total: number; completed: number; overdue: number }> = {};
  for (const e of enrollments ?? []) {
    const s = statsMap[e.course_id] ?? { total: 0, completed: 0, overdue: 0 };
    s.total++;
    if (e.status === "completed") s.completed++;
    if (e.status === "overdue") s.overdue++;
    statsMap[e.course_id] = s;
  }

  const result = (courses ?? []).map((c: any) => ({
    ...c,
    total_enrolled: statsMap[c.id]?.total ?? 0,
    completed_count: statsMap[c.id]?.completed ?? 0,
    overdue_count: statsMap[c.id]?.overdue ?? 0,
  }));

  return { success: true, data: result };
}

export async function listMyEnrollments(): Promise<ActionResult<Enrollment[]>> {
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
    .from("training_enrollments")
    .select("*, training_courses(*), employees!employee_id(first_name, last_name)")
    .eq("employee_id", (emp as { id: string }).id)
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false });

  if (error) return { success: false, error: error.message };

  return { success: true, data: mapEnrollments(data ?? []) };
}

export async function listCourseEnrollments(courseId: string): Promise<ActionResult<Enrollment[]>> {
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();

  const { data, error } = await supabase
    .from("training_enrollments")
    .select("*, training_courses(*), employees!employee_id(first_name, last_name)")
    .eq("course_id", courseId)
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: true });

  if (error) return { success: false, error: error.message };

  return { success: true, data: mapEnrollments(data ?? []) };
}

function mapEnrollments(data: any[]): Enrollment[] {
  return data.map((e: any) => ({
    id: e.id,
    course_id: e.course_id,
    employee_id: e.employee_id,
    course_title: e.training_courses?.title ?? "",
    course_description: e.training_courses?.description ?? null,
    course_category: e.training_courses?.category ?? "custom",
    course_is_mandatory: e.training_courses?.is_mandatory ?? false,
    course_due_date: e.training_courses?.due_date ?? null,
    course_content_url: e.training_courses?.content_url ?? null,
    course_duration_minutes: e.training_courses?.duration_minutes ?? null,
    employee_name: `${e.employees?.first_name ?? ""} ${e.employees?.last_name ?? ""}`.trim(),
    status: e.status,
    progress_percent: e.progress_percent,
    completed_at: e.completed_at,
    certificate_url: e.certificate_url,
    created_at: e.created_at,
  }));
}

export async function createCourse(
  formData: z.infer<typeof courseSchema>
): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can create courses" };
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const validated = courseSchema.safeParse(formData);
  if (!validated.success) {
    return { success: false, error: validated.error.errors[0]?.message ?? "Validation failed" };
  }

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("training_courses")
    .insert({
      org_id: ctx.orgId,
      title: validated.data.title,
      description: validated.data.description || null,
      category: validated.data.category,
      content_url: validated.data.content_url || null,
      duration_minutes: validated.data.duration_minutes ?? null,
      is_mandatory: validated.data.is_mandatory,
      due_date: validated.data.due_date || null,
    })
    .select("id")
    .single();

  if (error || !data) return { success: false, error: error?.message ?? "Failed to create course" };

  revalidatePath("/dashboard/training");
  return { success: true, data: { id: (data as { id: string }).id } };
}

export async function updateCourse(
  courseId: string,
  formData: z.infer<typeof courseSchema>
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can update courses" };
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const validated = courseSchema.safeParse(formData);
  if (!validated.success) {
    return { success: false, error: validated.error.errors[0]?.message ?? "Validation failed" };
  }

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("training_courses")
    .update({
      title: validated.data.title,
      description: validated.data.description || null,
      category: validated.data.category,
      content_url: validated.data.content_url || null,
      duration_minutes: validated.data.duration_minutes ?? null,
      is_mandatory: validated.data.is_mandatory,
      due_date: validated.data.due_date || null,
    })
    .eq("id", courseId)
    .eq("org_id", ctx.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/training");
  return { success: true, data: undefined };
}

export async function deleteCourse(courseId: string): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can delete courses" };
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("training_courses")
    .delete()
    .eq("id", courseId)
    .eq("org_id", ctx.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/training");
  return { success: true, data: undefined };
}

// ---- Enrollment actions ----

export async function enrollEmployees(
  courseId: string,
  employeeIds: string[]
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can enroll employees" };
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  if (employeeIds.length === 0) return { success: false, error: "Select at least one employee" };

  const supabase = createAdminSupabase();

  // Get already-enrolled employees to avoid duplicate key errors
  const { data: existing } = await supabase
    .from("training_enrollments")
    .select("employee_id")
    .eq("course_id", courseId)
    .eq("org_id", ctx.orgId);

  const existingIds = new Set((existing ?? []).map((e: any) => e.employee_id));
  const newIds = employeeIds.filter((id) => !existingIds.has(id));

  if (newIds.length === 0) {
    return { success: false, error: "All selected employees are already enrolled" };
  }

  const inserts = newIds.map((empId) => ({
    org_id: ctx.orgId,
    course_id: courseId,
    employee_id: empId,
    status: "assigned" as const,
    progress_percent: 0,
  }));

  const { error } = await supabase.from("training_enrollments").insert(inserts);
  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/training");
  return { success: true, data: undefined };
}

export async function unenrollEmployee(
  enrollmentId: string
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can unenroll employees" };
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("training_enrollments")
    .delete()
    .eq("id", enrollmentId)
    .eq("org_id", ctx.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/training");
  return { success: true, data: undefined };
}

export async function updateProgress(
  enrollmentId: string,
  data: z.infer<typeof progressSchema>
): Promise<ActionResult<void>> {
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Not authenticated" };

  const validated = progressSchema.safeParse(data);
  if (!validated.success) {
    return { success: false, error: validated.error.errors[0]?.message ?? "Validation failed" };
  }

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("training_enrollments")
    .update({
      progress_percent: validated.data.progress_percent,
      status: validated.data.status,
      certificate_url: validated.data.certificate_url || null,
      completed_at:
        validated.data.status === "completed" ? new Date().toISOString() : null,
    })
    .eq("id", enrollmentId)
    .eq("org_id", ctx.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/training");
  return { success: true, data: undefined };
}
