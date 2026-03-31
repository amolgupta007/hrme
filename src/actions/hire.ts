"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import type { ActionResult } from "@/types";

// ---- Types ----

export type JobStatus = "draft" | "active" | "paused" | "closed";
export type ApplicationStage =
  | "applied"
  | "screening"
  | "interview_1"
  | "interview_2"
  | "final_round"
  | "offer"
  | "hired"
  | "rejected";

export type Job = {
  id: string;
  org_id: string;
  title: string;
  department_id: string | null;
  department_name: string | null;
  description: string;
  employment_type: "full_time" | "part_time" | "contract" | "intern";
  location_type: "on_site" | "remote" | "hybrid";
  location: string | null;
  salary_min: number | null;
  salary_max: number | null;
  show_salary: boolean;
  status: JobStatus;
  custom_questions: { question: string; required: boolean }[];
  application_count: number;
  created_at: string;
};

export type Candidate = {
  id: string;
  org_id: string;
  name: string;
  email: string;
  phone: string | null;
  resume_url: string | null;
  linkedin_url: string | null;
  source: string;
  tags: string[];
  created_at: string;
};

export type Application = {
  id: string;
  org_id: string;
  job_id: string;
  job_title: string;
  candidate_id: string;
  candidate_name: string;
  candidate_email: string;
  stage: ApplicationStage;
  rejection_reason: string | null;
  cover_note: string | null;
  applied_at: string;
};

// ---- Schemas ----

const JobSchema = z.object({
  title: z.string().min(1, "Title is required"),
  department_id: z.string().uuid().optional().or(z.literal("")),
  description: z.string().min(1, "Description is required"),
  employment_type: z.enum(["full_time", "part_time", "contract", "intern"]),
  location_type: z.enum(["on_site", "remote", "hybrid"]),
  location: z.string().optional(),
  salary_min: z.number().optional(),
  salary_max: z.number().optional(),
  show_salary: z.boolean().default(false),
  status: z.enum(["draft", "active", "paused", "closed"]).default("draft"),
  custom_questions: z
    .array(z.object({ question: z.string(), required: z.boolean() }))
    .default([]),
});

// ---- Helpers ----

async function getHireContext() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!user.jambaHireEnabled) return null;
  return user;
}

// ---- Jobs ----

export async function listJobs(): Promise<ActionResult<Job[]>> {
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();

  const [{ data: jobs, error }, { data: depts }, { data: appCounts }] = await Promise.all([
    supabase.from("jobs").select("*").eq("org_id", user.orgId).order("created_at", { ascending: false }),
    supabase.from("departments").select("id, name").eq("org_id", user.orgId),
    supabase.from("applications").select("job_id").eq("org_id", user.orgId),
  ]);

  if (error) return { success: false, error: error.message };

  const deptMap = new Map((depts ?? []).map((d: any) => [d.id, d.name]));
  const countMap = new Map<string, number>();
  for (const app of appCounts ?? []) {
    const key = (app as any).job_id;
    countMap.set(key, (countMap.get(key) ?? 0) + 1);
  }

  const rows: Job[] = (jobs ?? []).map((j: any) => ({
    ...j,
    department_name: j.department_id ? (deptMap.get(j.department_id) ?? null) : null,
    custom_questions: j.custom_questions ?? [],
    application_count: countMap.get(j.id) ?? 0,
  }));

  return { success: true, data: rows };
}

export async function getJob(id: string): Promise<ActionResult<Job>> {
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const [{ data: job, error }, { data: depts }, { count }] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", id).eq("org_id", user.orgId).single(),
    supabase.from("departments").select("id, name").eq("org_id", user.orgId),
    supabase
      .from("applications")
      .select("*", { count: "exact", head: true })
      .eq("job_id", id)
      .eq("org_id", user.orgId),
  ]);

  if (error || !job) return { success: false, error: "Job not found" };

  const deptMap = new Map((depts ?? []).map((d: any) => [d.id, d.name]));

  return {
    success: true,
    data: {
      ...(job as any),
      department_name: (job as any).department_id ? (deptMap.get((job as any).department_id) ?? null) : null,
      custom_questions: (job as any).custom_questions ?? [],
      application_count: count ?? 0,
    },
  };
}

export async function createJob(input: z.infer<typeof JobSchema>): Promise<ActionResult<{ id: string }>> {
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can create jobs" };

  const parsed = JobSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message };

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("jobs")
    .insert({
      org_id: user.orgId,
      ...parsed.data,
      department_id: parsed.data.department_id || null,
      location: parsed.data.location || null,
      created_by: user.employeeId,
    })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath("/hire/jobs");
  return { success: true, data: { id: (data as any).id } };
}

export async function updateJob(id: string, input: z.infer<typeof JobSchema>): Promise<ActionResult<void>> {
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can update jobs" };

  const parsed = JobSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message };

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("jobs")
    .update({
      ...parsed.data,
      department_id: parsed.data.department_id || null,
      location: parsed.data.location || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("org_id", user.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/hire/jobs");
  revalidatePath(`/hire/jobs/${id}`);
  return { success: true, data: undefined };
}

export async function updateJobStatus(id: string, status: JobStatus): Promise<ActionResult<void>> {
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can change job status" };

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("jobs")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", user.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/hire/jobs");
  revalidatePath(`/hire/jobs/${id}`);
  return { success: true, data: undefined };
}

export async function deleteJob(id: string): Promise<ActionResult<void>> {
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can delete jobs" };

  const supabase = createAdminSupabase();
  const { error } = await supabase.from("jobs").delete().eq("id", id).eq("org_id", user.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/hire/jobs");
  return { success: true, data: undefined };
}

// ---- Candidates ----

export async function listCandidates(): Promise<ActionResult<(Candidate & { applications: { job_title: string; stage: ApplicationStage }[] })[]>> {
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const [{ data: candidates, error }, { data: apps }, { data: jobs }] = await Promise.all([
    supabase.from("candidates").select("*").eq("org_id", user.orgId).order("created_at", { ascending: false }),
    supabase.from("applications").select("candidate_id, job_id, stage").eq("org_id", user.orgId),
    supabase.from("jobs").select("id, title").eq("org_id", user.orgId),
  ]);

  if (error) return { success: false, error: error.message };

  const jobMap = new Map((jobs ?? []).map((j: any) => [j.id, j.title]));

  const appsByCandidate = new Map<string, { job_title: string; stage: ApplicationStage }[]>();
  for (const app of apps ?? []) {
    const a = app as any;
    const list = appsByCandidate.get(a.candidate_id) ?? [];
    list.push({ job_title: jobMap.get(a.job_id) ?? "Unknown", stage: a.stage });
    appsByCandidate.set(a.candidate_id, list);
  }

  return {
    success: true,
    data: (candidates ?? []).map((c: any) => ({
      ...c,
      tags: c.tags ?? [],
      applications: appsByCandidate.get(c.id) ?? [],
    })),
  };
}

// ---- Applications ----

export async function listApplications(jobId: string): Promise<ActionResult<Application[]>> {
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const [{ data: apps, error }, { data: candidates }, { data: job }] = await Promise.all([
    supabase.from("applications").select("*").eq("job_id", jobId).eq("org_id", user.orgId).order("applied_at"),
    supabase.from("candidates").select("id, name, email").eq("org_id", user.orgId),
    supabase.from("jobs").select("title").eq("id", jobId).single(),
  ]);

  if (error) return { success: false, error: error.message };

  const candMap = new Map((candidates ?? []).map((c: any) => [c.id, c]));

  return {
    success: true,
    data: (apps ?? []).map((a: any) => {
      const cand = candMap.get(a.candidate_id) as any;
      return {
        ...a,
        job_title: (job as any)?.title ?? "",
        candidate_name: cand?.name ?? "Unknown",
        candidate_email: cand?.email ?? "",
      };
    }),
  };
}

export async function listAllApplications(): Promise<ActionResult<Application[]>> {
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const [{ data: apps, error }, { data: candidates }, { data: jobs }] = await Promise.all([
    supabase.from("applications").select("*").eq("org_id", user.orgId).order("applied_at"),
    supabase.from("candidates").select("id, name, email").eq("org_id", user.orgId),
    supabase.from("jobs").select("id, title").eq("org_id", user.orgId),
  ]);

  if (error) return { success: false, error: error.message };

  const candMap = new Map((candidates ?? []).map((c: any) => [c.id, c]));
  const jobMap = new Map((jobs ?? []).map((j: any) => [j.id, j.title]));

  return {
    success: true,
    data: (apps ?? []).map((a: any) => {
      const cand = candMap.get(a.candidate_id) as any;
      return {
        ...a,
        job_title: jobMap.get(a.job_id) ?? "Unknown",
        candidate_name: cand?.name ?? "Unknown",
        candidate_email: cand?.email ?? "",
      };
    }),
  };
}

export async function updateApplicationStage(
  id: string,
  stage: ApplicationStage
): Promise<ActionResult<void>> {
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("applications")
    .update({ stage, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", user.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/hire/pipeline");
  revalidatePath("/hire/candidates");
  return { success: true, data: undefined };
}

export async function rejectApplication(id: string, reason: string): Promise<ActionResult<void>> {
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("applications")
    .update({ stage: "rejected", rejection_reason: reason, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", user.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/hire/pipeline");
  revalidatePath("/hire/candidates");
  return { success: true, data: undefined };
}

// ---- Public (no auth required) ----

export async function getPublicJobs(orgSlug: string): Promise<ActionResult<{ org: { name: string; slug: string }; jobs: Job[] }>> {
  const supabase = createAdminSupabase();

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .eq("slug", orgSlug)
    .single();

  if (orgError || !org) return { success: false, error: "Organization not found" };

  const { data: jobs, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("org_id", (org as any).id)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    data: {
      org: org as any,
      jobs: (jobs ?? []).map((j: any) => ({
        ...j,
        department_name: null,
        custom_questions: j.custom_questions ?? [],
        application_count: 0,
      })),
    },
  };
}

export async function submitApplication(
  jobId: string,
  data: { name: string; email: string; phone?: string; linkedin_url?: string; cover_note?: string; answers?: { question: string; answer: string }[] }
): Promise<ActionResult<void>> {
  const supabase = createAdminSupabase();

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, org_id, status")
    .eq("id", jobId)
    .single();

  if (jobError || !job) return { success: false, error: "Job not found" };
  if ((job as any).status !== "active") return { success: false, error: "This position is no longer accepting applications" };

  const orgId = (job as any).org_id;

  // Upsert candidate (same email = same candidate)
  const { data: candidate, error: candError } = await supabase
    .from("candidates")
    .upsert(
      { org_id: orgId, name: data.name, email: data.email, phone: data.phone || null, linkedin_url: data.linkedin_url || null, source: "direct" },
      { onConflict: "org_id,email" }
    )
    .select("id")
    .single();

  if (candError || !candidate) return { success: false, error: "Failed to save application" };

  // Insert application (ignore duplicate — already applied)
  const { error: appError } = await supabase
    .from("applications")
    .insert({
      org_id: orgId,
      job_id: jobId,
      candidate_id: (candidate as any).id,
      stage: "applied",
      cover_note: data.cover_note || null,
      answers: data.answers ?? [],
    });

  if (appError) {
    if (appError.code === "23505") return { success: false, error: "You have already applied for this position" };
    return { success: false, error: "Failed to submit application" };
  }

  return { success: true, data: undefined };
}
