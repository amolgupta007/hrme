"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
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
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can move application stages" };

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
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can reject applications" };

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

export async function bulkUpdateApplicationStage(ids: string[], stage: ApplicationStage): Promise<ActionResult<void>> {
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Admins only" };
  if (!ids.length) return { success: false, error: "No candidates selected" };

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("applications")
    .update({ stage, updated_at: new Date().toISOString() })
    .in("id", ids)
    .eq("org_id", user.orgId);

  if (error) return { success: false, error: error.message };
  revalidatePath("/hire/pipeline");
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
    .select("id, org_id, title, description, employment_type, location_type, location, salary_min, salary_max, show_salary, status, custom_questions, created_at")
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

export async function uploadApplicationFile(formData: FormData): Promise<ActionResult<{ url: string }>> {
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { success: false, error: "No file provided" };
  if (file.size > 5 * 1024 * 1024) return { success: false, error: "File must be under 5 MB" };

  const supabase = createAdminSupabase();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const path = `applications/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const bytes = await file.arrayBuffer();
  const { error } = await supabase.storage
    .from("documents")
    .upload(path, bytes, { contentType: file.type });

  if (error) return { success: false, error: error.message };

  const { data: urlData } = supabase.storage.from("documents").getPublicUrl(path);
  return { success: true, data: { url: urlData.publicUrl } };
}

const applicationSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  email: z.string().email("Valid email required"),
  phone: z.string().max(20).optional(),
  linkedin_url: z.string().url("Invalid LinkedIn URL").optional().or(z.literal("")),
  resume_url: z.string().optional(),
  work_samples: z.array(z.string()).optional(),
  cover_note: z.string().max(2000).optional(),
  answers: z.array(z.object({
    question: z.string(),
    answer: z.string(),
  })).optional(),
});

export async function submitApplication(
  jobId: string,
  data: {
    name: string;
    email: string;
    phone?: string;
    linkedin_url?: string;
    resume_url?: string;
    work_samples?: string[];
    cover_note?: string;
    answers?: { question: string; answer: string }[];
    source?: string;
  }
): Promise<ActionResult<void>> {
  const validated = applicationSchema.safeParse(data);
  if (!validated.success) {
    return { success: false, error: validated.error.errors[0]?.message ?? "Validation failed" };
  }
  const d = validated.data;

  const supabase = createAdminSupabase();

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, org_id, status")
    .eq("id", jobId)
    .single();

  if (jobError || !job) return { success: false, error: "Job not found" };
  if ((job as any).status !== "active") return { success: false, error: "This position is no longer accepting applications" };

  const orgId = (job as any).org_id;

  // Upsert candidate — update resume_url if provided
  const candidatePayload: Record<string, unknown> = {
    org_id: orgId,
    name: d.name,
    email: d.email,
    phone: d.phone || null,
    linkedin_url: d.linkedin_url || null,
    source: ["direct", "referral", "linkedin", "naukri", "indeed", "other"].includes(data.source ?? "")
      ? data.source!
      : "direct",
  };
  if (d.resume_url) candidatePayload.resume_url = d.resume_url;

  const { data: candidate, error: candError } = await supabase
    .from("candidates")
    .upsert(candidatePayload, { onConflict: "org_id,email" })
    .select("id")
    .single();

  if (candError || !candidate) return { success: false, error: "Failed to save application" };

  // Build answers array — append work samples as a special entry if provided
  const allAnswers = [...(d.answers ?? [])];
  const workSamples = (d.work_samples ?? []).filter(Boolean);
  if (workSamples.length > 0) {
    allAnswers.push({ question: "__work_samples__", answer: workSamples.join("\n") });
  }

  const { error: appError } = await supabase
    .from("applications")
    .insert({
      org_id: orgId,
      job_id: jobId,
      candidate_id: (candidate as any).id,
      stage: "applied",
      cover_note: d.cover_note || null,
      answers: allAnswers,
    });

  if (appError) {
    if (appError.code === "23505") return { success: false, error: "You have already applied for this position" };
    return { success: false, error: "Failed to submit application" };
  }

  return { success: true, data: undefined };
}

// ---- AI: Job Description Generator ----

export async function generateJobDescription(input: {
  title: string;
  department?: string;
  employmentType: string;
  locationType: string;
  notes?: string;
}): Promise<ActionResult<string>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { success: false, error: "AI not configured" };

  const client = new Anthropic({ apiKey });

  const employmentLabels: Record<string, string> = {
    full_time: "Full-time",
    part_time: "Part-time",
    contract: "Contract",
    intern: "Internship",
  };
  const locationLabels: Record<string, string> = {
    on_site: "On-site",
    remote: "Remote",
    hybrid: "Hybrid",
  };

  const prompt = `Write a professional job description for the following role. Output plain text only — no markdown, no asterisks, no headers with #. Use clear section labels followed by a colon, and write in a direct, engaging tone suited for an Indian SMB.

Role: ${input.title}
${input.department ? `Department: ${input.department}` : ""}
Employment type: ${employmentLabels[input.employmentType] ?? input.employmentType}
Work mode: ${locationLabels[input.locationType] ?? input.locationType}
${input.notes ? `Additional context from hiring manager:\n${input.notes}` : ""}

Structure the JD with these sections:
About the Role
What You'll Do
What We're Looking For
Nice to Have
Why Join Us

Keep it concise — around 300–400 words total.`;

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as any).text)
      .join("");

    return { success: true, data: text.trim() };
  } catch (err: any) {
    console.error("JD generation error:", err);
    return { success: false, error: "AI generation failed. Try again." };
  }
}

// ---- Types: Interviews & Offers ----

export type InterviewSchedule = {
  id: string;
  org_id: string;
  application_id: string;
  candidate_name: string;
  candidate_email: string;
  job_title: string;
  job_id: string;
  interviewer_id: string | null;
  interviewer_name: string | null;
  scheduled_at: string;
  duration_minutes: number;
  interview_type: "video" | "phone" | "in_person";
  meeting_link: string | null;
  status: "scheduled" | "completed" | "cancelled" | "no_show";
  notes: string | null;
  feedback: InterviewFeedback | null;
};

export type InterviewFeedback = {
  id: string;
  schedule_id: string;
  interviewer_id: string | null;
  technical_rating: number | null;
  communication_rating: number | null;
  culture_fit_rating: number | null;
  overall_rating: number | null;
  recommendation: "strong_yes" | "yes" | "no" | "strong_no" | null;
  notes: string | null;
};

export type Offer = {
  id: string;
  org_id: string;
  application_id: string;
  candidate_name: string;
  candidate_email: string;
  job_title: string;
  ctc: number;
  joining_date: string;
  role_title: string;
  department_id: string | null;
  department_name: string | null;
  reporting_manager_id: string | null;
  reporting_manager_name: string | null;
  additional_terms: string | null;
  status: "draft" | "sent" | "accepted" | "declined" | "expired";
  offer_token: string;
  sent_at: string | null;
  responded_at: string | null;
  response_note: string | null;
  created_at: string;
};

// ---- Interview Schedules ----

export async function listInterviews(): Promise<ActionResult<InterviewSchedule[]>> {
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const [{ data: schedules, error }, { data: apps }, { data: candidates }, { data: jobs }, { data: employees }, { data: feedbacks }] = await Promise.all([
    supabase.from("interview_schedules").select("*").eq("org_id", user.orgId).order("scheduled_at"),
    supabase.from("applications").select("id, job_id, candidate_id").eq("org_id", user.orgId),
    supabase.from("candidates").select("id, name, email").eq("org_id", user.orgId),
    supabase.from("jobs").select("id, title").eq("org_id", user.orgId),
    supabase.from("employees").select("id, first_name, last_name").eq("org_id", user.orgId),
    supabase.from("interview_feedback").select("*").eq("org_id", user.orgId),
  ]);

  if (error) return { success: false, error: error.message };

  const appMap = new Map((apps ?? []).map((a: any) => [a.id, a]));
  const candMap = new Map((candidates ?? []).map((c: any) => [c.id, c]));
  const jobMap = new Map((jobs ?? []).map((j: any) => [j.id, j.title]));
  const empMap = new Map((employees ?? []).map((e: any) => [e.id, `${e.first_name} ${e.last_name}`]));
  const feedbackMap = new Map((feedbacks ?? []).map((f: any) => [f.schedule_id, f]));

  return {
    success: true,
    data: (schedules ?? []).map((s: any) => {
      const app = appMap.get(s.application_id) as any;
      const cand = app ? candMap.get(app.candidate_id) as any : null;
      return {
        ...s,
        candidate_name: cand?.name ?? "Unknown",
        candidate_email: cand?.email ?? "",
        job_title: app ? (jobMap.get(app.job_id) ?? "Unknown") : "Unknown",
        job_id: app?.job_id ?? "",
        interviewer_name: s.interviewer_id ? (empMap.get(s.interviewer_id) ?? null) : null,
        feedback: feedbackMap.get(s.id) ?? null,
      };
    }),
  };
}

export async function scheduleInterview(input: {
  application_id: string;
  interviewer_id?: string;
  scheduled_at: string;
  duration_minutes: number;
  interview_type: "video" | "phone" | "in_person";
  meeting_link?: string;
  notes?: string;
}): Promise<ActionResult<{ id: string }>> {
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can schedule interviews" };

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("interview_schedules")
    .insert({
      org_id: user.orgId,
      application_id: input.application_id,
      interviewer_id: input.interviewer_id || null,
      scheduled_at: input.scheduled_at,
      duration_minutes: input.duration_minutes,
      interview_type: input.interview_type,
      meeting_link: input.meeting_link || null,
      notes: input.notes || null,
      status: "scheduled",
    })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath("/hire/interviews");
  return { success: true, data: { id: (data as any).id } };
}

export async function updateInterviewStatus(
  id: string,
  status: "scheduled" | "completed" | "cancelled" | "no_show"
): Promise<ActionResult<void>> {
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can update interview status" };

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("interview_schedules")
    .update({ status })
    .eq("id", id)
    .eq("org_id", user.orgId);

  if (error) return { success: false, error: error.message };
  revalidatePath("/hire/interviews");
  return { success: true, data: undefined };
}

export async function submitInterviewFeedback(input: {
  schedule_id: string;
  technical_rating: number;
  communication_rating: number;
  culture_fit_rating: number;
  overall_rating: number;
  recommendation: "strong_yes" | "yes" | "no" | "strong_no";
  notes: string;
}): Promise<ActionResult<void>> {
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();

  // Verify caller is assigned interviewer or admin
  const { data: schedule } = await supabase
    .from("interview_schedules")
    .select("interviewer_id")
    .eq("id", input.schedule_id)
    .eq("org_id", user.orgId)
    .single();
  if (!schedule) return { success: false, error: "Interview not found" };
  if (!isAdmin(user.role) && (schedule as any).interviewer_id !== user.employeeId) {
    return { success: false, error: "You can only submit feedback for interviews you conducted" };
  }

  const { error } = await supabase
    .from("interview_feedback")
    .upsert(
      {
        org_id: user.orgId,
        schedule_id: input.schedule_id,
        interviewer_id: user.employeeId,
        technical_rating: input.technical_rating,
        communication_rating: input.communication_rating,
        culture_fit_rating: input.culture_fit_rating,
        overall_rating: input.overall_rating,
        recommendation: input.recommendation,
        notes: input.notes,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: "schedule_id,interviewer_id" }
    );

  if (error) return { success: false, error: error.message };
  revalidatePath("/hire/interviews");
  return { success: true, data: undefined };
}

// ---- Offers ----

export async function listOffers(): Promise<ActionResult<Offer[]>> {
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const [{ data: offers, error }, { data: apps }, { data: candidates }, { data: jobs }, { data: depts }, { data: employees }] = await Promise.all([
    supabase.from("offers").select("*").eq("org_id", user.orgId).order("created_at", { ascending: false }),
    supabase.from("applications").select("id, job_id, candidate_id").eq("org_id", user.orgId),
    supabase.from("candidates").select("id, name, email").eq("org_id", user.orgId),
    supabase.from("jobs").select("id, title").eq("org_id", user.orgId),
    supabase.from("departments").select("id, name").eq("org_id", user.orgId),
    supabase.from("employees").select("id, first_name, last_name").eq("org_id", user.orgId),
  ]);

  if (error) return { success: false, error: error.message };

  const appMap = new Map((apps ?? []).map((a: any) => [a.id, a]));
  const candMap = new Map((candidates ?? []).map((c: any) => [c.id, c]));
  const jobMap = new Map((jobs ?? []).map((j: any) => [j.id, j.title]));
  const deptMap = new Map((depts ?? []).map((d: any) => [d.id, d.name]));
  const empMap = new Map((employees ?? []).map((e: any) => [e.id, `${e.first_name} ${e.last_name}`]));

  return {
    success: true,
    data: (offers ?? []).map((o: any) => {
      const app = appMap.get(o.application_id) as any;
      const cand = app ? candMap.get(app.candidate_id) as any : null;
      return {
        ...o,
        candidate_name: cand?.name ?? "Unknown",
        candidate_email: cand?.email ?? "",
        job_title: app ? (jobMap.get(app.job_id) ?? "Unknown") : "Unknown",
        department_name: o.department_id ? (deptMap.get(o.department_id) ?? null) : null,
        reporting_manager_name: o.reporting_manager_id ? (empMap.get(o.reporting_manager_id) ?? null) : null,
      };
    }),
  };
}

export async function createOffer(input: {
  application_id: string;
  ctc: number;
  joining_date: string;
  role_title: string;
  department_id?: string;
  reporting_manager_id?: string;
  additional_terms?: string;
}): Promise<ActionResult<{ id: string }>> {
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can create offers" };

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("offers")
    .insert({
      org_id: user.orgId,
      application_id: input.application_id,
      ctc: input.ctc,
      joining_date: input.joining_date,
      role_title: input.role_title,
      department_id: input.department_id || null,
      reporting_manager_id: input.reporting_manager_id || null,
      additional_terms: input.additional_terms || null,
      status: "draft",
      offer_token: crypto.randomUUID(),
    })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };
  revalidatePath("/hire/offers");
  return { success: true, data: { id: (data as any).id } };
}

export async function sendOffer(offerId: string): Promise<ActionResult<void>> {
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can send offers" };

  const supabase = createAdminSupabase();
  const { data: offer, error } = await supabase
    .from("offers")
    .select("*")
    .eq("id", offerId)
    .eq("org_id", user.orgId)
    .single();

  if (error || !offer) return { success: false, error: "Offer not found" };

  const { data: app } = await supabase
    .from("applications")
    .select("candidate_id")
    .eq("id", (offer as any).application_id)
    .single();

  const [{ data: candidate }, { data: org }] = await Promise.all([
    supabase.from("candidates").select("name, email").eq("id", (app as any)?.candidate_id).single(),
    supabase.from("organizations").select("name").eq("id", user.orgId).single(),
  ]);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://jambahr.com";
  const offerUrl = `${appUrl}/offers/${(offer as any).offer_token}`;

  try {
    const { resend, FROM_EMAIL } = await import("@/lib/resend");
    const { render } = await import("@react-email/render");
    const { OfferLetterEmail } = await import("@/components/emails/offer-letter");

    const html = await render(
      OfferLetterEmail({
        candidateName: (candidate as any)?.name ?? "Candidate",
        orgName: (org as any)?.name ?? "Company",
        roleTitle: (offer as any).role_title,
        ctc: (offer as any).ctc,
        joiningDate: (offer as any).joining_date,
        additionalTerms: (offer as any).additional_terms ?? undefined,
        offerUrl,
      })
    );

    await resend.emails.send({
      from: FROM_EMAIL,
      to: (candidate as any)?.email ?? "",
      subject: `Your offer letter from ${(org as any)?.name ?? "us"}`,
      html,
    });

    await supabase
      .from("offers")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", offerId)
      .eq("org_id", user.orgId);

    revalidatePath("/hire/offers");
    return { success: true, data: undefined };
  } catch (emailErr) {
    console.error("Offer email failed:", emailErr);
    return {
      success: false,
      error: `Offer saved but email failed to send. Share this link with the candidate directly: ${offerUrl}`,
    };
  }
}

// ---- Public: Offer Response ----

export async function getOfferByToken(token: string): Promise<ActionResult<{ offer: Offer; orgName: string }>> {
  const supabase = createAdminSupabase();

  const { data: offer, error } = await supabase
    .from("offers")
    .select("*")
    .eq("offer_token", token)
    .single();

  if (error || !offer) return { success: false, error: "Offer not found or expired" };

  const { data: app } = await supabase
    .from("applications")
    .select("candidate_id, job_id")
    .eq("id", (offer as any).application_id)
    .single();

  const [{ data: candidate }, { data: job }, { data: org }] = await Promise.all([
    supabase.from("candidates").select("name, email").eq("id", (app as any)?.candidate_id).single(),
    supabase.from("jobs").select("title").eq("id", (app as any)?.job_id).single(),
    supabase.from("organizations").select("name").eq("id", (offer as any).org_id).single(),
  ]);

  return {
    success: true,
    data: {
      orgName: (org as any)?.name ?? "Company",
      offer: {
        ...(offer as any),
        candidate_name: (candidate as any)?.name ?? "Candidate",
        candidate_email: (candidate as any)?.email ?? "",
        job_title: (job as any)?.title ?? "",
        department_name: null,
        reporting_manager_name: null,
      },
    },
  };
}

export async function respondToOffer(
  token: string,
  response: "accepted" | "declined",
  note?: string
): Promise<ActionResult<void>> {
  const supabase = createAdminSupabase();

  const { data: offer, error } = await supabase
    .from("offers")
    .select("id, status, application_id, org_id")
    .eq("offer_token", token)
    .single();

  if (error || !offer) return { success: false, error: "Offer not found" };
  if ((offer as any).status !== "sent") return { success: false, error: "This offer is no longer active" };

  await supabase
    .from("offers")
    .update({ status: response, responded_at: new Date().toISOString(), response_note: note || null })
    .eq("id", (offer as any).id);

  if (response === "accepted") {
    await supabase
      .from("applications")
      .update({ stage: "hired", updated_at: new Date().toISOString() })
      .eq("id", (offer as any).application_id);
  }

  return { success: true, data: undefined };
}
