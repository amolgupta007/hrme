"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin, isManagerOrAbove } from "@/lib/current-user";
import { sendInvite } from "./invites";
import {
  syncReferralFromApplicationStage,
  markReferralRejectedByApplication,
} from "@/lib/referrals/sync";
import { computeDirection, type TransitionDirection } from "@/lib/hire/stage-direction";
import { planActionsForTransition, roundLabelForStage, type ActionKey } from "@/lib/hire/transitions";
import { canMoveStage, isOwnerOrAdmin } from "@/lib/hire/permissions";
import { checkOfferToHiredGates } from "@/lib/hire/gates";
import { waitUntil } from "@vercel/functions";
import { maybePushJobToIndeed } from "@/lib/indeed/sync";
import type { ActionResult } from "@/types";

// ---- Types ----

export type JobStatus = "draft" | "active" | "paused" | "closed";
export type ApplicationStage =
  | "applied"
  | "screening"
  | "shortlisted"
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
  // M5 — null until admin assigns a hiring manager
  hiring_manager_id: string | null;
  // Indeed integration (migration 068) — null/false until org opts a job in
  indeed_enabled: boolean;
  indeed_job_id: string | null;
  indeed_status: "pending" | "posted" | "expired" | "error" | null;
  indeed_synced_at: string | null;
  indeed_sync_error: string | null;
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
  resume_url: string | null;
  answers: { question: string; answer: string }[] | null;
  // M4 — LOI flow. Nullable when no LOI has ever been issued for this application.
  loi_status: "pending" | "accepted" | "declined" | "expired" | null;
  loi_sent_at: string | null;
  loi_responded_at: string | null;
  loi_expires_at: string | null;
  // M5 — set on the linked job, denormalised here for manager-scoped UI permissions.
  job_hiring_manager_id: string | null;
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
  // M5 — hiring_manager_id is the FK to employees, persisted on jobs row.
  hiring_manager_id: z.string().uuid().optional().or(z.literal("")),
});

// ---- Helpers ----

async function getHireContext() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!user.jambaHireEnabled) return null;
  return user;
}

/**
 * Admin-only variant. Use for read actions that should never be callable
 * by managers/employees (jobs, candidates, applications, interviews,
 * offers — full org pipeline). Mutations keep using getHireContext +
 * their existing isAdmin/isManagerOrAbove guard so manager-eligible
 * operations (e.g. interviewer feedback) still work.
 */
async function getHireAdminContext() {
  const user = await getHireContext();
  if (!user) return null;
  if (!isAdmin(user.role)) return null;
  return user;
}

// ---- Jobs ----

export async function listJobs(): Promise<ActionResult<Job[]>> {
  const user = await getHireAdminContext();
  if (!user) return { success: false, error: "Unauthorized" };

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
  const user = await getHireAdminContext();
  if (!user) return { success: false, error: "Unauthorized" };

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
      hiring_manager_id: parsed.data.hiring_manager_id || null,
      created_by: user.employeeId,
    })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };

  // best-effort Indeed sync (no-op unless the job is later opted in)
  waitUntil((async () => { maybePushJobToIndeed((data as any).id); })());
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
      hiring_manager_id: parsed.data.hiring_manager_id || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("org_id", user.orgId);

  if (error) return { success: false, error: error.message };

  waitUntil((async () => { maybePushJobToIndeed(id); })());
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

  waitUntil((async () => { maybePushJobToIndeed(id); })());
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
  const user = await getHireAdminContext();
  if (!user) return { success: false, error: "Unauthorized" };

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

export async function createCandidate(input: {
  name: string;
  email: string;
  phone?: string;
  linkedin_url?: string;
  source?: string;
}): Promise<ActionResult<{ id: string }>> {
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isManagerOrAbove(user.role)) return { success: false, error: "Unauthorized" };

  const supabase = createAdminSupabase();

  const source = ["direct", "referral", "linkedin", "naukri", "indeed", "other"].includes(input.source ?? "")
    ? input.source!
    : "direct";

  const { data, error } = await supabase
    .from("candidates")
    .insert({
      org_id: user.orgId,
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone?.trim() || null,
      linkedin_url: input.linkedin_url?.trim() || null,
      source,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { success: false, error: "A candidate with this email already exists" };
    return { success: false, error: error.message };
  }

  revalidatePath("/hire/candidates");
  return { success: true, data: { id: (data as any).id } };
}

// ---- Applications ----

export async function listApplications(jobId: string): Promise<ActionResult<Application[]>> {
  const user = await getHireAdminContext();
  if (!user) return { success: false, error: "Unauthorized" };

  const supabase = createAdminSupabase();
  const [{ data: apps, error }, { data: candidates }, { data: job }] = await Promise.all([
    supabase.from("applications").select("*").eq("job_id", jobId).eq("org_id", user.orgId).order("applied_at"),
    supabase.from("candidates").select("id, name, email, resume_url").eq("org_id", user.orgId),
    supabase.from("jobs").select("title, hiring_manager_id").eq("id", jobId).single(),
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
        resume_url: (cand as any)?.resume_url ?? null,
        answers: (a as any).answers ?? null,
        job_hiring_manager_id: (job as any)?.hiring_manager_id ?? null,
      };
    }),
  };
}

export async function listAllApplications(): Promise<ActionResult<Application[]>> {
  const user = await getHireAdminContext();
  if (!user) return { success: false, error: "Unauthorized" };

  const supabase = createAdminSupabase();
  const [{ data: apps, error }, { data: candidates }, { data: jobs }] = await Promise.all([
    supabase.from("applications").select("*").eq("org_id", user.orgId).order("applied_at"),
    supabase.from("candidates").select("id, name, email").eq("org_id", user.orgId),
    supabase.from("jobs").select("id, title, hiring_manager_id").eq("org_id", user.orgId),
  ]);

  if (error) return { success: false, error: error.message };

  const candMap = new Map((candidates ?? []).map((c: any) => [c.id, c]));
  const jobMap = new Map((jobs ?? []).map((j: any) => [j.id, { title: j.title as string, hiring_manager_id: j.hiring_manager_id as string | null }]));

  const applications = (apps ?? []).map((a: any) => {
    const cand = candMap.get(a.candidate_id) as any;
    const jobMeta = jobMap.get(a.job_id);
    return {
      ...a,
      job_title: jobMeta?.title ?? "Unknown",
      candidate_name: cand?.name ?? "Unknown",
      candidate_email: cand?.email ?? "",
      job_hiring_manager_id: jobMeta?.hiring_manager_id ?? null,
    };
  });

  // Attach screening results (additive — missing rows get null fields)
  const appIds = applications.map((a: any) => a.id);
  let screeningRows: any[] = [];
  if (appIds.length) {
    const { data: sData } = await (supabase as any)
      .from("screening_results")
      .select("application_id, score, tier")
      .in("application_id", appIds)
      .eq("org_id", user.orgId);
    screeningRows = sData ?? [];
  }
  const byApp = new Map(screeningRows.map((s: any) => [s.application_id, s]));
  const withScores = applications.map((a: any) => ({
    ...a,
    screening_score: byApp.get(a.id)?.score ?? null,
    screening_tier: byApp.get(a.id)?.tier ?? null,
  }));

  return {
    success: true,
    data: withScores,
  };
}

export async function updateApplicationStage(
  id: string,
  stage: ApplicationStage,
  opts?: { comment?: string }
): Promise<ActionResult<{ transitionId: string | null }>> {
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();

  // Fetch current stage + job_id so we can compute direction and check permissions.
  const { data: existing, error: fetchErr } = await supabase
    .from("applications")
    .select("stage, job_id")
    .eq("id", id)
    .eq("org_id", user.orgId)
    .single();
  if (fetchErr || !existing) return { success: false, error: fetchErr?.message ?? "Application not found" };

  const fromStage = (existing as { stage: ApplicationStage; job_id: string }).stage;
  const jobId = (existing as { stage: ApplicationStage; job_id: string }).job_id;
  const direction = computeDirection(fromStage, stage);
  const comment = opts?.comment?.trim() || null;

  // M5: hired is terminal — terminate the employee from /dashboard/employees first.
  if (fromStage === "hired") {
    return { success: false, error: "This candidate has been hired. Terminate the employee from the directory first." };
  }

  // M5: hiring drag (→ hired) is gated by the convert-to-employee wizard, not this action.
  if (stage === "hired") {
    return {
      success: false,
      error: "Use the convert-to-employee wizard to mark someone as hired (gates on offer status + joining date).",
    };
  }

  // M5: per-role permissions. Owner/admin pass through; managers limited to own jobs + interview stages.
  const { data: jobRow } = await supabase
    .from("jobs")
    .select("hiring_manager_id")
    .eq("id", jobId)
    .eq("org_id", user.orgId)
    .single();
  const jobHiringManagerId = (jobRow as { hiring_manager_id: string | null } | null)?.hiring_manager_id ?? null;

  if (!canMoveStage(fromStage, stage, {
    role: user.role,
    employeeId: user.employeeId,
    jobHiringManagerId,
  })) {
    return {
      success: false,
      error: isOwnerOrAdmin(user.role)
        ? "Only admins/owners can move into this stage."
        : "You can only move candidates on jobs where you're the hiring manager.",
    };
  }

  // M5: backward from a sent-and-not-yet-responded offer requires explicit revoke.
  if (fromStage === "offer" && direction === "backward") {
    const { data: linkedOffer } = await supabase
      .from("offers")
      .select("id, status")
      .eq("application_id", id)
      .eq("org_id", user.orgId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const status = (linkedOffer as { status: string } | null)?.status ?? null;
    if (status === "sent") {
      return {
        success: false,
        error: "Revoke the offer first from the Offers page before moving this candidate back.",
      };
    }
  }

  if (direction === "backward" && !comment) {
    return { success: false, error: "A reason is required when moving a candidate to an earlier stage." };
  }

  const { error } = await supabase
    .from("applications")
    .update({ stage, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", user.orgId);
  if (error) return { success: false, error: error.message };

  const transitionId = await writeStageTransition({
    orgId: user.orgId,
    applicationId: id,
    fromStage,
    toStage: stage,
    direction,
    actorId: user.employeeId,
    actorType: isAdmin(user.role) ? "admin" : "manager",
    comment,
  });

  await syncReferralFromApplicationStage(id, stage);

  revalidatePath("/hire/pipeline");
  revalidatePath("/hire/candidates");
  revalidatePath("/hire/referrals");
  revalidatePath("/dashboard/refer/my-referrals");
  return { success: true, data: { transitionId } };
}

export async function rejectApplication(
  id: string,
  reason: string,
): Promise<ActionResult<{ transitionId: string | null }>> {
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can reject applications" };

  const trimmedReason = reason?.trim();
  if (!trimmedReason) return { success: false, error: "A reason is required to reject a candidate." };

  const supabase = createAdminSupabase();

  const { data: existing, error: fetchErr } = await supabase
    .from("applications")
    .select("stage")
    .eq("id", id)
    .eq("org_id", user.orgId)
    .single();
  if (fetchErr || !existing) return { success: false, error: fetchErr?.message ?? "Application not found" };

  const fromStage = (existing as { stage: ApplicationStage }).stage;

  const { error } = await supabase
    .from("applications")
    .update({ stage: "rejected", rejection_reason: trimmedReason, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", user.orgId);
  if (error) return { success: false, error: error.message };

  const transitionId = await writeStageTransition({
    orgId: user.orgId,
    applicationId: id,
    fromStage,
    toStage: "rejected",
    direction: "reject",
    actorId: user.employeeId,
    actorType: isAdmin(user.role) ? "admin" : "manager",
    comment: trimmedReason,
  });

  await markReferralRejectedByApplication(id);

  revalidatePath("/hire/pipeline");
  revalidatePath("/hire/candidates");
  revalidatePath("/hire/referrals");
  revalidatePath("/dashboard/refer/my-referrals");
  return { success: true, data: { transitionId } };
}

export async function bulkUpdateApplicationStage(
  ids: string[],
  stage: ApplicationStage,
  opts?: { comment?: string }
): Promise<ActionResult<{ transitionIds: string[] }>> {
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Admins only" };
  if (!ids.length) return { success: false, error: "No candidates selected" };

  const supabase = createAdminSupabase();

  const { data: existingRows, error: fetchErr } = await supabase
    .from("applications")
    .select("id, stage")
    .in("id", ids)
    .eq("org_id", user.orgId);
  if (fetchErr) return { success: false, error: fetchErr.message };

  const comment = opts?.comment?.trim() || null;
  const rows = (existingRows ?? []) as Array<{ id: string; stage: ApplicationStage }>;
  const fromMap = new Map(rows.map((r) => [r.id, r.stage]));

  const hasBackward = rows.some((r) => computeDirection(r.stage, stage) === "backward");
  if (hasBackward && !comment) {
    return { success: false, error: "A reason is required — the selection includes a backward move." };
  }

  const { error } = await supabase
    .from("applications")
    .update({ stage, updated_at: new Date().toISOString() })
    .in("id", ids)
    .eq("org_id", user.orgId);
  if (error) return { success: false, error: error.message };

  // Batch-insert one transition row per id.
  const actorType: "admin" | "manager" = isAdmin(user.role) ? "admin" : "manager";
  const transitionRows = ids.map((id) => {
    const fromStage = fromMap.get(id) ?? null;
    const direction = computeDirection(fromStage, stage);
    return {
      org_id: user.orgId,
      application_id: id,
      from_stage: fromStage,
      to_stage: stage,
      direction,
      actor_id: user.employeeId,
      actor_type: actorType,
      comment: direction === "backward" ? comment : null,
    };
  });
  const { data: inserted } = await supabase
    .from("candidate_stage_transitions")
    .insert(transitionRows as any)
    .select("id");
  const transitionIds = ((inserted as Array<{ id: string }> | null) ?? []).map((r) => r.id);

  await Promise.all(ids.map((id) => syncReferralFromApplicationStage(id, stage)));

  revalidatePath("/hire/pipeline");
  revalidatePath("/hire/referrals");
  revalidatePath("/dashboard/refer/my-referrals");
  return { success: true, data: { transitionIds } };
}

// ---- Audit log read + write helpers ----

async function writeStageTransition(args: {
  orgId: string;
  applicationId: string;
  fromStage: ApplicationStage | null;
  toStage: ApplicationStage;
  direction: TransitionDirection;
  actorId: string | null;
  actorType: "admin" | "manager" | "system" | "candidate";
  comment: string | null;
}): Promise<string | null> {
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("candidate_stage_transitions")
    .insert({
      org_id: args.orgId,
      application_id: args.applicationId,
      from_stage: args.fromStage,
      to_stage: args.toStage,
      direction: args.direction,
      actor_id: args.actorId,
      actor_type: args.actorType,
      comment: args.comment,
    } as any)
    .select("id")
    .single();
  // Best-effort: never block the main action on audit-write failure. Surface in logs.
  if (error) {
    console.warn("writeStageTransition failed:", error.message);
    return null;
  }
  return (data as { id: string } | null)?.id ?? null;
}

export type StageTransition = {
  id: string;
  from_stage: ApplicationStage | null;
  to_stage: ApplicationStage;
  direction: TransitionDirection;
  actor_id: string | null;
  actor_name: string | null;
  actor_type: "admin" | "manager" | "system" | "candidate";
  comment: string | null;
  created_at: string;
};

export async function getApplicationTransitions(applicationId: string): Promise<ActionResult<StageTransition[]>> {
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("candidate_stage_transitions")
    .select("id, from_stage, to_stage, direction, actor_id, actor_type, comment, created_at")
    .eq("application_id", applicationId)
    .eq("org_id", user.orgId)
    .order("created_at", { ascending: false });
  if (error) return { success: false, error: error.message };

  const rows = (data ?? []) as Array<{
    id: string;
    from_stage: ApplicationStage | null;
    to_stage: ApplicationStage;
    direction: TransitionDirection;
    actor_id: string | null;
    actor_type: "admin" | "manager" | "system" | "candidate";
    comment: string | null;
    created_at: string;
  }>;

  // Hydrate actor names in one round trip.
  const actorIds = Array.from(new Set(rows.map((r) => r.actor_id).filter(Boolean) as string[]));
  let nameMap = new Map<string, string>();
  if (actorIds.length) {
    const { data: emps } = await supabase
      .from("employees")
      .select("id, first_name, last_name")
      .in("id", actorIds)
      .eq("org_id", user.orgId);
    nameMap = new Map(
      ((emps ?? []) as Array<{ id: string; first_name: string; last_name: string }>).map((e) => [
        e.id,
        `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() || "Unknown",
      ]),
    );
  }

  return {
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      from_stage: r.from_stage,
      to_stage: r.to_stage,
      direction: r.direction,
      actor_id: r.actor_id,
      actor_name: r.actor_id ? nameMap.get(r.actor_id) ?? null : null,
      actor_type: r.actor_type,
      comment: r.comment,
      created_at: r.created_at,
    })),
  };
}

// ---- M4: Letter of Interest (LOI) flow ----
//
// Admin "drags" a card Screening → Shortlisted. Instead of advancing the stage
// immediately, sendLOI generates a token, marks loi_status='pending', and emails
// the candidate. The card visually stays in Screening (UI driven by loi_status).
// When the candidate clicks accept on /loi/[token] (public), respondToLOI moves
// the stage to 'shortlisted' and emails the hiring manager(s). Decline routes to
// 'rejected' with reason "LOI declined".

const LOI_EXPIRY_DAYS = 7; // hardcoded v1; per-org override deferred to v2 (locked Q4)

export async function sendLOI(applicationId: string): Promise<ActionResult<{ loiUrl: string }>> {
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can send Letters of Interest" };

  const supabase = createAdminSupabase();

  const { data: existing, error: fetchErr } = await supabase
    .from("applications")
    .select("id, stage, loi_status, candidate_id, job_id, org_id")
    .eq("id", applicationId)
    .eq("org_id", user.orgId)
    .single();
  if (fetchErr || !existing) return { success: false, error: fetchErr?.message ?? "Application not found" };
  const app = existing as {
    id: string; stage: ApplicationStage; loi_status: string | null;
    candidate_id: string; job_id: string; org_id: string;
  };

  if (app.stage !== "screening") {
    return { success: false, error: "LOI can only be sent from the Screening stage" };
  }
  if (app.loi_status === "pending") {
    return { success: false, error: "An LOI is already pending for this candidate. Wait or resend." };
  }

  const { randomBytes } = await import("node:crypto");
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + LOI_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { error: updateErr } = await supabase
    .from("applications")
    .update({
      loi_sent_at: new Date().toISOString(),
      loi_status: "pending",
      loi_token: token,
      loi_expires_at: expiresAt,
      loi_responded_at: null,
    } as any)
    .eq("id", applicationId)
    .eq("org_id", user.orgId);
  if (updateErr) return { success: false, error: updateErr.message };

  // Hydrate candidate, job, org for the email
  const [{ data: candidate }, { data: job }, { data: org }] = await Promise.all([
    supabase.from("candidates").select("name, email").eq("id", app.candidate_id).single(),
    supabase.from("jobs").select("title").eq("id", app.job_id).single(),
    supabase.from("organizations").select("name").eq("id", app.org_id).single(),
  ]);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://jambahr.com";
  const loiUrl = `${appUrl}/loi/${token}`;

  try {
    const { resend, NOREPLY_EMAIL, FROM_EMAIL } = await import("@/lib/resend");
    const { render } = await import("@react-email/render");
    const { LoiInviteEmail } = await import("@/components/emails/loi-invite");

    const html = await render(
      LoiInviteEmail({
        candidateName: (candidate as any)?.name ?? "Candidate",
        orgName: (org as any)?.name ?? "Company",
        roleTitle: (job as any)?.title ?? "the role",
        loiUrl,
        expiresInDays: LOI_EXPIRY_DAYS,
      }),
    );

    await resend.emails.send({
      from: NOREPLY_EMAIL,
      to: (candidate as any)?.email ?? "",
      replyTo: FROM_EMAIL,
      subject: `You've been shortlisted — ${(org as any)?.name ?? "JambaHire"}`,
      html,
    });
  } catch (emailErr) {
    console.error("LOI email failed:", emailErr);
    // Still return success — admin can resend. Token is saved.
    return {
      success: true,
      data: { loiUrl: `${loiUrl} (email send failed — share manually)` },
    };
  }

  revalidatePath("/hire/pipeline");
  revalidatePath("/hire/candidates");
  return { success: true, data: { loiUrl } };
}

// ---- M3: Confirm-Send side-effect dispatch ----
//
// Called by the ConfirmTransitionDialog when the admin clicks Send. Looks up the
// transition + application context, runs the user-confirmed subset of actions,
// records per-action status in candidate_stage_transitions.side_effects_status.
// Unconfirmed actions are recorded as 'skipped_by_user' so the audit trail is
// complete. Empty enabledKeys = Skip All (dialog dismissed or user said no).

type DispatchResult = "sent" | "skipped_by_user" | "failed";

export async function dispatchStageTransitionSideEffects(
  transitionId: string,
  enabledKeys: string[],
): Promise<ActionResult<{ results: Record<string, DispatchResult> }>> {
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Admins only" };

  const supabase = createAdminSupabase();

  const { data: transitionRow, error: tErr } = await supabase
    .from("candidate_stage_transitions")
    .select("id, application_id, from_stage, to_stage, direction")
    .eq("id", transitionId)
    .eq("org_id", user.orgId)
    .single();
  if (tErr || !transitionRow) return { success: false, error: tErr?.message ?? "Transition not found" };
  const transition = transitionRow as {
    id: string;
    application_id: string;
    from_stage: ApplicationStage | null;
    to_stage: ApplicationStage;
    direction: TransitionDirection;
  };

  const { data: appRow } = await supabase
    .from("applications")
    .select("id, candidate_id, job_id, org_id")
    .eq("id", transition.application_id)
    .eq("org_id", user.orgId)
    .single();
  if (!appRow) return { success: false, error: "Application not found" };
  const app = appRow as { id: string; candidate_id: string; job_id: string; org_id: string };

  const [{ data: candidateRow }, { data: jobRow }, { data: orgRow }] = await Promise.all([
    supabase.from("candidates").select("name, email").eq("id", app.candidate_id).single(),
    supabase.from("jobs").select("title").eq("id", app.job_id).single(),
    supabase.from("organizations").select("name").eq("id", app.org_id).single(),
  ]);
  if (!candidateRow || !jobRow || !orgRow) return { success: false, error: "Missing related data for email" };
  const candidate = candidateRow as { name: string; email: string };
  const job = jobRow as { title: string };
  const org = orgRow as { name: string };

  const plannedActions = planActionsForTransition(transition.direction, transition.from_stage, transition.to_stage);
  const results: Record<string, DispatchResult> = {};

  for (const action of plannedActions) {
    if (!enabledKeys.includes(action.key)) {
      results[action.key] = "skipped_by_user";
      continue;
    }
    try {
      await dispatchTransitionAction(action.key, {
        candidateName: candidate.name,
        candidateEmail: candidate.email,
        orgName: org.name,
        roleTitle: job.title,
        fromStage: transition.from_stage,
        toStage: transition.to_stage,
      });
      results[action.key] = "sent";
    } catch (err) {
      console.error(`dispatchTransitionAction ${action.key} failed:`, err);
      results[action.key] = "failed";
    }
  }

  // Persist per-action status. Best-effort — don't block on audit-update failure.
  const { error: updateErr } = await supabase
    .from("candidate_stage_transitions")
    .update({ side_effects_status: results } as any)
    .eq("id", transitionId)
    .eq("org_id", user.orgId);
  if (updateErr) console.warn("side_effects_status update failed:", updateErr.message);

  return { success: true, data: { results } };
}

async function dispatchTransitionAction(
  key: ActionKey,
  ctx: {
    candidateName: string;
    candidateEmail: string;
    orgName: string;
    roleTitle: string;
    fromStage: ApplicationStage | null;
    toStage: ApplicationStage;
  },
) {
  const { resend, NOREPLY_EMAIL, FROM_EMAIL } = await import("@/lib/resend");
  const { render } = await import("@react-email/render");

  if (!ctx.candidateEmail) throw new Error("Candidate has no email address on file");

  switch (key) {
    case "email-candidate-ack": {
      const { CandidateAckEmail } = await import("@/components/emails/candidate-ack");
      const html = await render(
        CandidateAckEmail({
          candidateName: ctx.candidateName,
          orgName: ctx.orgName,
          roleTitle: ctx.roleTitle,
        }),
      );
      const result = await resend.emails.send({
        from: NOREPLY_EMAIL,
        to: ctx.candidateEmail,
        replyTo: FROM_EMAIL,
        subject: `Thanks for applying — ${ctx.orgName}`,
        html,
      });
      if ((result as any).error) throw new Error((result as any).error.message ?? "Resend error");
      return;
    }
    case "email-interview-next-round": {
      const { InterviewNextRoundEmail } = await import("@/components/emails/interview-next-round");
      const roundLabel = roundLabelForStage(ctx.toStage);
      const html = await render(
        InterviewNextRoundEmail({
          candidateName: ctx.candidateName,
          orgName: ctx.orgName,
          roleTitle: ctx.roleTitle,
          roundLabel,
        }),
      );
      const result = await resend.emails.send({
        from: NOREPLY_EMAIL,
        to: ctx.candidateEmail,
        replyTo: FROM_EMAIL,
        subject: `Advancing to ${roundLabel} — ${ctx.orgName}`,
        html,
      });
      if ((result as any).error) throw new Error((result as any).error.message ?? "Resend error");
      return;
    }
    case "email-rejection": {
      const usePostInterview = ctx.fromStage
        ? (["interview_1", "interview_2", "final_round", "offer"] as ApplicationStage[]).includes(ctx.fromStage)
        : false;
      if (usePostInterview) {
        const { RejectionPostInterviewEmail } = await import("@/components/emails/rejection-postinterview");
        const html = await render(
          RejectionPostInterviewEmail({
            candidateName: ctx.candidateName,
            orgName: ctx.orgName,
            roleTitle: ctx.roleTitle,
          }),
        );
        const result = await resend.emails.send({
          from: NOREPLY_EMAIL,
          to: ctx.candidateEmail,
          replyTo: FROM_EMAIL,
          subject: `Thank you for interviewing with ${ctx.orgName}`,
          html,
        });
        if ((result as any).error) throw new Error((result as any).error.message ?? "Resend error");
      } else {
        const { RejectionEarlyEmail } = await import("@/components/emails/rejection-early");
        const html = await render(
          RejectionEarlyEmail({
            candidateName: ctx.candidateName,
            orgName: ctx.orgName,
            roleTitle: ctx.roleTitle,
          }),
        );
        const result = await resend.emails.send({
          from: NOREPLY_EMAIL,
          to: ctx.candidateEmail,
          replyTo: FROM_EMAIL,
          subject: `Update on your application — ${ctx.orgName}`,
          html,
        });
        if ((result as any).error) throw new Error((result as any).error.message ?? "Resend error");
      }
      return;
    }
  }
}

// ---- Public (no auth required) ----

// ---- M4: Public LOI accept/decline ----

export type LoiInfo = {
  applicationId: string;
  candidateName: string;
  orgName: string;
  roleTitle: string;
  status: "pending" | "accepted" | "declined" | "expired";
  expiresAt: string | null;
  respondedAt: string | null;
};

export async function getApplicationByLoiToken(token: string): Promise<ActionResult<LoiInfo>> {
  if (!token) return { success: false, error: "Missing token" };
  const supabase = createAdminSupabase();

  const { data: app, error } = await supabase
    .from("applications")
    .select("id, candidate_id, job_id, org_id, loi_status, loi_expires_at, loi_responded_at")
    .eq("loi_token", token)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!app) return { success: false, error: "Invalid or expired link" };
  const a = app as any;

  const [{ data: candidate }, { data: job }, { data: org }] = await Promise.all([
    supabase.from("candidates").select("name").eq("id", a.candidate_id).single(),
    supabase.from("jobs").select("title").eq("id", a.job_id).single(),
    supabase.from("organizations").select("name").eq("id", a.org_id).single(),
  ]);

  let status: LoiInfo["status"] = (a.loi_status as LoiInfo["status"]) ?? "expired";
  if (status === "pending" && a.loi_expires_at && new Date(a.loi_expires_at).getTime() < Date.now()) {
    status = "expired";
  }

  return {
    success: true,
    data: {
      applicationId: a.id,
      candidateName: (candidate as any)?.name ?? "Candidate",
      orgName: (org as any)?.name ?? "Company",
      roleTitle: (job as any)?.title ?? "the role",
      status,
      expiresAt: a.loi_expires_at ?? null,
      respondedAt: a.loi_responded_at ?? null,
    },
  };
}

export async function respondToLOI(
  token: string,
  response: "accept" | "decline",
): Promise<ActionResult<{ result: "accepted" | "declined"; orgName: string; roleTitle: string }>> {
  if (!token) return { success: false, error: "Missing token" };
  const supabase = createAdminSupabase();

  const { data: app, error: fetchErr } = await supabase
    .from("applications")
    .select("id, org_id, stage, candidate_id, job_id, loi_status, loi_expires_at")
    .eq("loi_token", token)
    .maybeSingle();
  if (fetchErr) return { success: false, error: fetchErr.message };
  if (!app) return { success: false, error: "Invalid link" };
  const a = app as any;

  if (a.loi_status !== "pending") {
    return { success: false, error: `This link has already been used (status: ${a.loi_status}).` };
  }
  if (a.loi_expires_at && new Date(a.loi_expires_at).getTime() < Date.now()) {
    // Lazy expire: flip status before refusing.
    await supabase
      .from("applications")
      .update({ loi_status: "expired" } as any)
      .eq("id", a.id);
    return { success: false, error: "This link has expired. Please contact the hiring team." };
  }

  const respondedAtIso = new Date().toISOString();

  if (response === "accept") {
    const { error: updateErr } = await supabase
      .from("applications")
      .update({
        loi_status: "accepted",
        loi_responded_at: respondedAtIso,
        stage: "shortlisted",
        updated_at: respondedAtIso,
      } as any)
      .eq("id", a.id)
      .eq("org_id", a.org_id);
    if (updateErr) return { success: false, error: updateErr.message };

    // Audit row: candidate-actor advances screening → shortlisted
    await writeStageTransition({
      orgId: a.org_id,
      applicationId: a.id,
      fromStage: "screening",
      toStage: "shortlisted",
      direction: "forward",
      actorId: null,
      actorType: "candidate",
      comment: "Candidate accepted the LOI",
    });

    await syncReferralFromApplicationStage(a.id, "shortlisted");

    // Notify hiring admins (no hiring_manager_id yet — that lands in M5).
    const [{ data: org }, { data: candidate }, { data: job }, { data: admins }] = await Promise.all([
      supabase.from("organizations").select("name").eq("id", a.org_id).single(),
      supabase.from("candidates").select("name").eq("id", a.candidate_id).single(),
      supabase.from("jobs").select("title").eq("id", a.job_id).single(),
      supabase
        .from("employees")
        .select("first_name, last_name, email")
        .eq("org_id", a.org_id)
        .in("role", ["owner", "admin"])
        .neq("status", "terminated"),
    ]);

    try {
      // Phase 1: filter out admins with no email (phone-only staff). Phase 2 will route to WhatsApp.
      const recipients = ((admins ?? []) as Array<{ first_name: string; last_name: string; email: string | null }>)
        .map((e) => e.email?.trim() ?? "")
        .filter(Boolean);
      if (recipients.length > 0) {
        const { resend, FROM_EMAIL } = await import("@/lib/resend");
        const { render } = await import("@react-email/render");
        const { ManagerShortlistNotifyEmail } = await import("@/components/emails/manager-shortlist-notify");
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://jambahr.com";
        const html = await render(
          ManagerShortlistNotifyEmail({
            managerName: "team",
            candidateName: (candidate as any)?.name ?? "Candidate",
            roleTitle: (job as any)?.title ?? "the role",
            orgName: (org as any)?.name ?? "Company",
            pipelineUrl: `${appUrl}/hire/pipeline`,
          }),
        );
        await resend.emails.send({
          from: FROM_EMAIL,
          to: recipients,
          subject: `Candidate accepted — ${(candidate as any)?.name ?? "candidate"} ready to schedule`,
          html,
        });
      }
    } catch (emailErr) {
      console.error("manager-shortlist-notify email failed:", emailErr);
    }

    revalidatePath("/hire/pipeline");

    return {
      success: true,
      data: {
        result: "accepted",
        orgName: (org as any)?.name ?? "Company",
        roleTitle: (job as any)?.title ?? "the role",
      },
    };
  }

  // response === "decline"
  const { error: updateErr } = await supabase
    .from("applications")
    .update({
      loi_status: "declined",
      loi_responded_at: respondedAtIso,
      stage: "rejected",
      rejection_reason: "LOI declined",
      updated_at: respondedAtIso,
    } as any)
    .eq("id", a.id)
    .eq("org_id", a.org_id);
  if (updateErr) return { success: false, error: updateErr.message };

  await writeStageTransition({
    orgId: a.org_id,
    applicationId: a.id,
    fromStage: a.stage as ApplicationStage,
    toStage: "rejected",
    direction: "reject",
    actorId: null,
    actorType: "candidate",
    comment: "LOI declined",
  });

  await markReferralRejectedByApplication(a.id);

  const [{ data: org2 }, { data: job2 }] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", a.org_id).single(),
    supabase.from("jobs").select("title").eq("id", a.job_id).single(),
  ]);

  revalidatePath("/hire/pipeline");

  return {
    success: true,
    data: {
      result: "declined",
      orgName: (org2 as any)?.name ?? "Company",
      roleTitle: (job2 as any)?.title ?? "the role",
    },
  };
}

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

export type MyInterview = {
  schedule_id: string;
  scheduled_at: string;
  type: string;
  status: string;
  duration_minutes: number | null;
  candidate_name: string;
  job_title: string;
  feedback_submitted: boolean;
};

/**
 * Slim interviewer-side feed. Returns only interviews where the caller
 * is the assigned interviewer, projected to the minimal fields they
 * need to do their job. Never returns: salary, offer details, other
 * candidates' info, or other interviewers' feedback.
 */
export async function listMyInterviews(): Promise<ActionResult<MyInterview[]>> {
  const user = await getHireContext();
  if (!user) return { success: false, error: "Unauthorized" };
  if (!user.employeeId) return { success: true, data: [] };

  const supabase = createAdminSupabase();
  const { data: schedules, error } = await supabase
    .from("interview_schedules")
    .select("id, scheduled_at, interview_type, status, duration_minutes, application_id")
    .eq("org_id", user.orgId)
    .eq("interviewer_id", user.employeeId)
    .order("scheduled_at", { ascending: false });
  if (error) return { success: false, error: error.message };
  if (!schedules || schedules.length === 0) return { success: true, data: [] };

  const appIds = (schedules as any[]).map((s) => s.application_id);
  const scheduleIds = (schedules as any[]).map((s) => s.id);

  const [{ data: apps }, { data: feedbacks }] = await Promise.all([
    supabase
      .from("applications")
      .select("id, candidate_id, job_id")
      .in("id", appIds),
    supabase
      .from("interview_feedback")
      .select("schedule_id")
      .in("schedule_id", scheduleIds)
      .eq("interviewer_id", user.employeeId),
  ]);

  const candidateIds = Array.from(new Set((apps ?? []).map((a: any) => a.candidate_id)));
  const jobIds = Array.from(new Set((apps ?? []).map((a: any) => a.job_id)));

  const [{ data: candidates }, { data: jobs }] = await Promise.all([
    supabase.from("candidates").select("id, name").in("id", candidateIds.length ? candidateIds : [""]),
    supabase.from("jobs").select("id, title").in("id", jobIds.length ? jobIds : [""]),
  ]);

  const appMap = new Map<string, any>((apps ?? []).map((a: any) => [a.id, a]));
  const candidateMap = new Map<string, string>((candidates ?? []).map((c: any) => [c.id, c.name]));
  const jobMap = new Map<string, string>((jobs ?? []).map((j: any) => [j.id, j.title]));
  const submittedSet = new Set<string>((feedbacks ?? []).map((f: any) => f.schedule_id));

  const result: MyInterview[] = (schedules as any[]).map((s) => {
    const app = appMap.get(s.application_id);
    return {
      schedule_id: s.id,
      scheduled_at: s.scheduled_at,
      type: s.interview_type,
      status: s.status,
      duration_minutes: s.duration_minutes ?? null,
      candidate_name: app ? (candidateMap.get(app.candidate_id) ?? "—") : "—",
      job_title: app ? (jobMap.get(app.job_id) ?? "—") : "—",
      feedback_submitted: submittedSet.has(s.id),
    };
  });

  return { success: true, data: result };
}

export async function listInterviews(): Promise<ActionResult<InterviewSchedule[]>> {
  const user = await getHireAdminContext();
  if (!user) return { success: false, error: "Unauthorized" };

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

export async function rescheduleInterview(
  scheduleId: string,
  input: {
    scheduled_at: string;
    interview_type?: "video" | "phone" | "in_person";
    meeting_link?: string;
  }
): Promise<ActionResult<void>> {
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isManagerOrAbove(user.role)) return { success: false, error: "Unauthorized" };

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("interview_schedules")
    .update({
      scheduled_at: input.scheduled_at,
      ...(input.interview_type && { interview_type: input.interview_type }),
      ...(input.meeting_link !== undefined && { meeting_link: input.meeting_link || null }),
    })
    .eq("id", scheduleId)
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
  const user = await getHireAdminContext();
  if (!user) return { success: false, error: "Unauthorized" };

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

export async function updateOffer(
  offerId: string,
  input: {
    role_title: string;
    ctc: number;
    joining_date: string;
    department_id?: string;
    reporting_manager_id?: string;
    additional_terms?: string;
  }
): Promise<ActionResult<void>> {
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can edit offers" };

  const supabase = createAdminSupabase();
  const { data: existing, error: fetchErr } = await supabase
    .from("offers")
    .select("status")
    .eq("id", offerId)
    .eq("org_id", user.orgId)
    .single();

  if (fetchErr || !existing) return { success: false, error: "Offer not found" };
  if (!["draft", "sent"].includes((existing as any).status)) {
    return { success: false, error: "Cannot edit an offer that has been accepted or declined" };
  }

  const { error } = await supabase
    .from("offers")
    .update({
      role_title: input.role_title,
      ctc: input.ctc,
      joining_date: input.joining_date,
      department_id: input.department_id || null,
      reporting_manager_id: input.reporting_manager_id || null,
      additional_terms: input.additional_terms || null,
    })
    .eq("id", offerId)
    .eq("org_id", user.orgId);

  if (error) return { success: false, error: error.message };
  revalidatePath("/hire/offers");
  return { success: true, data: undefined };
}

export async function deleteOffer(offerId: string): Promise<ActionResult<void>> {
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can delete offers" };

  const supabase = createAdminSupabase();
  const { data: existing, error: fetchErr } = await supabase
    .from("offers")
    .select("status")
    .eq("id", offerId)
    .eq("org_id", user.orgId)
    .single();

  if (fetchErr || !existing) return { success: false, error: "Offer not found" };
  if (["accepted", "declined"].includes((existing as any).status)) {
    return { success: false, error: "Cannot delete an offer that has already been responded to" };
  }

  const { error } = await supabase
    .from("offers")
    .delete()
    .eq("id", offerId)
    .eq("org_id", user.orgId);

  if (error) return { success: false, error: error.message };
  revalidatePath("/hire/offers");
  return { success: true, data: undefined };
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
    supabase.from("jobs").select("title, department_id, departments(name)").eq("id", (app as any)?.job_id).single(),
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
        department_name: ((job as any)?.departments as { name: string } | null)?.name ?? null,
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

// ---- M5: Convert offer → hire (employee creation + Clerk invite + welcome email) ----

export type ConvertOfferToHirePayload = {
  startDate: string;                  // YYYY-MM-DD
  departmentId: string | null;
  designation: string | null;
  employmentType: "full_time" | "part_time" | "contract" | "intern";
  reportingManagerId: string | null;
  role: "owner" | "admin" | "manager" | "employee";
  clerkInviteEmail: string;           // defaults to candidate email on the client
};

export async function convertOfferToHire(
  applicationId: string,
  payload: ConvertOfferToHirePayload,
): Promise<ActionResult<{ employeeId: string }>> {
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can convert offers to hires" };

  const supabase = createAdminSupabase();

  // Hydrate application + linked offer + candidate + org + clerk_org_id
  const { data: app, error: appErr } = await supabase
    .from("applications")
    .select("id, org_id, stage, candidate_id, job_id")
    .eq("id", applicationId)
    .eq("org_id", user.orgId)
    .single();
  if (appErr || !app) return { success: false, error: appErr?.message ?? "Application not found" };
  const a = app as { id: string; org_id: string; stage: ApplicationStage; candidate_id: string; job_id: string };

  const { data: offerRow } = await supabase
    .from("offers")
    .select("id, status, joining_date, role_title, department_id, reporting_manager_id, ctc")
    .eq("application_id", applicationId)
    .eq("org_id", user.orgId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const offer = offerRow as {
    id: string; status: "draft" | "sent" | "accepted" | "declined" | "expired" | "revoked";
    joining_date: string; role_title: string;
    department_id: string | null; reporting_manager_id: string | null; ctc: number;
  } | null;

  // Gate check (single source of truth shared with the client)
  const gate = checkOfferToHiredGates(offer);
  if (!gate.ok) return { success: false, error: gate.message };

  const [{ data: candidate }, { data: org }] = await Promise.all([
    supabase.from("candidates").select("name, email").eq("id", a.candidate_id).single(),
    supabase.from("organizations").select("id, name, max_employees").eq("id", a.org_id).single(),
  ]);
  if (!candidate || !org) return { success: false, error: "Missing related data" };
  const c = candidate as { name: string; email: string };
  const o = org as { id: string; name: string; max_employees: number };

  // Headroom check (matches addEmployee behavior)
  const { count: activeCount } = await supabase
    .from("employees")
    .select("*", { count: "exact", head: true })
    .eq("org_id", o.id)
    .eq("status", "active");
  if ((activeCount ?? 0) >= o.max_employees) {
    return { success: false, error: `Employee limit reached (${o.max_employees}). Upgrade the plan first.` };
  }

  const inviteEmail = (payload.clerkInviteEmail || c.email || "").trim();
  if (!inviteEmail) return { success: false, error: "Candidate email is required for the invite" };

  // Dupe check by email within the org
  const { data: dupe } = await supabase
    .from("employees")
    .select("id")
    .eq("org_id", o.id)
    .eq("email", inviteEmail)
    .maybeSingle();
  if (dupe) return { success: false, error: "An employee with this email already exists in this org" };

  // Split candidate name into first/last for the employees row
  const nameParts = c.name.trim().split(/\s+/);
  const firstName = nameParts[0] ?? "Employee";
  const lastName = nameParts.slice(1).join(" ") || ".";

  const { data: emp, error: insertErr } = await supabase
    .from("employees")
    .insert({
      org_id: o.id,
      first_name: firstName,
      last_name: lastName,
      email: inviteEmail,
      phone: null,
      department_id: payload.departmentId,
      designation: payload.designation,
      date_of_joining: payload.startDate,
      employment_type: payload.employmentType,
      role: payload.role,
      reporting_manager_id: payload.reportingManagerId,
      status: "active",
      metadata: {},
    } as any)
    .select("id")
    .single();
  if (insertErr) return { success: false, error: insertErr.message };
  const employeeId = (emp as { id: string }).id;

  // Advance the application + write the audit row
  const { error: stageErr } = await supabase
    .from("applications")
    .update({ stage: "hired", updated_at: new Date().toISOString() } as any)
    .eq("id", applicationId)
    .eq("org_id", o.id);
  if (stageErr) {
    // Roll back the employees insert so the application doesn't get into a bad state
    await supabase.from("employees").delete().eq("id", employeeId);
    return { success: false, error: stageErr.message };
  }

  await writeStageTransition({
    orgId: o.id,
    applicationId,
    fromStage: a.stage,
    toStage: "hired",
    direction: "forward",
    actorId: user.employeeId,
    actorType: isAdmin(user.role) ? "admin" : "manager",
    comment: `Converted to employee ${firstName} ${lastName}`,
  });

  await syncReferralFromApplicationStage(applicationId, "hired");

  // Send the account-setup email so the new hire can sign in and auto-link on
  // first sign-in (Clerk org invitations are gone). Best-effort, non-fatal.
  try {
    await sendInvite(employeeId);
  } catch (inviteErr) {
    console.warn("Account-setup email (convertOfferToHire) failed — non-fatal:", inviteErr);
  }

  // Welcome / handoff email (non-fatal)
  try {
    const { resend, NOREPLY_EMAIL, FROM_EMAIL } = await import("@/lib/resend");
    const { render } = await import("@react-email/render");
    const { HireOnboardingHandoffEmail } = await import("@/components/emails/hire-onboarding-handoff");
    const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://jambahr.com"}/dashboard`;
    const html = await render(
      HireOnboardingHandoffEmail({
        candidateName: c.name,
        orgName: o.name,
        roleTitle: offer?.role_title ?? "your new role",
        startDate: payload.startDate,
        portalUrl,
      }),
    );
    await resend.emails.send({
      from: NOREPLY_EMAIL,
      to: inviteEmail,
      replyTo: FROM_EMAIL,
      subject: `Welcome to ${o.name} 🎉`,
      html,
    });
  } catch (emailErr) {
    console.warn("Hire welcome email failed — non-fatal:", emailErr);
  }

  revalidatePath("/hire/pipeline");
  revalidatePath("/hire/candidates");
  revalidatePath("/dashboard/employees");

  return { success: true, data: { employeeId } };
}

// ---- M5: revoke a sent offer (sends offer-revoked email, no internal reason) ----

export async function revokeOffer(
  offerId: string,
  reason: string,
): Promise<ActionResult<void>> {
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can revoke offers" };

  const trimmed = reason?.trim();
  if (!trimmed) return { success: false, error: "An internal reason is required to revoke an offer." };

  const supabase = createAdminSupabase();

  const { data: offerRow, error: fetchErr } = await supabase
    .from("offers")
    .select("id, application_id, status, role_title")
    .eq("id", offerId)
    .eq("org_id", user.orgId)
    .single();
  if (fetchErr || !offerRow) return { success: false, error: fetchErr?.message ?? "Offer not found" };
  const offer = offerRow as { id: string; application_id: string; status: string; role_title: string };

  if (offer.status === "accepted" || offer.status === "declined" || offer.status === "revoked") {
    return { success: false, error: `Cannot revoke — offer status is "${offer.status}".` };
  }

  const { error: updateErr } = await supabase
    .from("offers")
    .update({ status: "revoked", response_note: trimmed } as any)
    .eq("id", offerId)
    .eq("org_id", user.orgId);
  if (updateErr) return { success: false, error: updateErr.message };

  // Send candidate the offer-revoked email (no internal reason text per design rule)
  try {
    const { data: app } = await supabase
      .from("applications")
      .select("candidate_id, job_id")
      .eq("id", offer.application_id)
      .single();
    if (app) {
      const [{ data: cand }, { data: org }] = await Promise.all([
        supabase.from("candidates").select("name, email").eq("id", (app as any).candidate_id).single(),
        supabase.from("organizations").select("name").eq("id", user.orgId).single(),
      ]);
      if (cand && (cand as any).email) {
        const { resend, NOREPLY_EMAIL, FROM_EMAIL } = await import("@/lib/resend");
        const { render } = await import("@react-email/render");
        const { OfferRevokedEmail } = await import("@/components/emails/offer-revoked");
        const html = await render(
          OfferRevokedEmail({
            candidateName: (cand as any).name ?? "Candidate",
            orgName: (org as any)?.name ?? "Company",
            roleTitle: offer.role_title,
          }),
        );
        await resend.emails.send({
          from: NOREPLY_EMAIL,
          to: (cand as any).email,
          replyTo: FROM_EMAIL,
          subject: `Update on your offer — ${(org as any)?.name ?? "JambaHire"}`,
          html,
        });
      }
    }
  } catch (emailErr) {
    console.warn("offer-revoked email failed — non-fatal:", emailErr);
  }

  revalidatePath("/hire/offers");
  revalidatePath("/hire/pipeline");
  return { success: true, data: undefined };
}

// ---- M5: prefill data for the convert-to-employee wizard ----

export type HirePrefillData = {
  offer: {
    id: string;
    status: "draft" | "sent" | "accepted" | "declined" | "expired" | "revoked";
    joining_date: string;
    role_title: string;
    department_id: string | null;
    reporting_manager_id: string | null;
    ctc: number;
  } | null;
  candidate: { name: string; email: string };
  departments: Array<{ id: string; name: string }>;
  potentialManagers: Array<{ id: string; name: string }>;
};

// M5: list employees who can be assigned as hiring_manager for a job
export async function listPotentialHiringManagers(): Promise<ActionResult<Array<{ id: string; name: string }>>> {
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Admins only" };
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("employees")
    .select("id, first_name, last_name")
    .eq("org_id", user.orgId)
    .in("role", ["owner", "admin", "manager"])
    .neq("status", "terminated")
    .order("first_name");
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    data: ((data ?? []) as Array<{ id: string; first_name: string; last_name: string }>).map((e) => ({
      id: e.id,
      name: `${e.first_name} ${e.last_name}`.trim() || "Unknown",
    })),
  };
}

export async function getHirePrefillData(applicationId: string): Promise<ActionResult<HirePrefillData>> {
  const user = await getHireContext();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Admins only" };

  const supabase = createAdminSupabase();

  const { data: app, error: appErr } = await supabase
    .from("applications")
    .select("candidate_id")
    .eq("id", applicationId)
    .eq("org_id", user.orgId)
    .single();
  if (appErr || !app) return { success: false, error: appErr?.message ?? "Application not found" };

  const [{ data: offer }, { data: cand }, { data: depts }, { data: emps }] = await Promise.all([
    supabase
      .from("offers")
      .select("id, status, joining_date, role_title, department_id, reporting_manager_id, ctc")
      .eq("application_id", applicationId)
      .eq("org_id", user.orgId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("candidates").select("name, email").eq("id", (app as any).candidate_id).single(),
    supabase.from("departments").select("id, name").eq("org_id", user.orgId).order("name"),
    supabase
      .from("employees")
      .select("id, first_name, last_name")
      .eq("org_id", user.orgId)
      .in("role", ["owner", "admin", "manager"])
      .neq("status", "terminated")
      .order("first_name"),
  ]);

  return {
    success: true,
    data: {
      offer: (offer as any) ?? null,
      candidate: {
        name: (cand as any)?.name ?? "Candidate",
        email: (cand as any)?.email ?? "",
      },
      departments: ((depts ?? []) as Array<{ id: string; name: string }>).map((d) => ({
        id: d.id,
        name: d.name,
      })),
      potentialManagers: ((emps ?? []) as Array<{ id: string; first_name: string; last_name: string }>).map((e) => ({
        id: e.id,
        name: `${e.first_name} ${e.last_name}`.trim() || "Unknown",
      })),
    },
  };
}

