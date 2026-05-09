"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { render } from "@react-email/render";
import type { ActionResult } from "@/types";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { isReferralsEnabled } from "@/lib/feature-flags";
import { resend, NOREPLY_EMAIL, FROM_EMAIL } from "@/lib/resend";
import { ReferralInviteEmail } from "@/components/emails/referral-invite";
import { ReferralReceivedEmail } from "@/components/emails/referral-received";
import {
  type ReferralStatus,
  type CoarseStatus,
  toCoarse,
} from "@/lib/referrals/status";

// ---- types --------------------------------------------------------------

export type CandidateReferral = {
  id: string;
  org_id: string;
  job_id: string;
  referrer_employee_id: string | null;
  referrer_clerk_user_id: string;
  candidate_name: string;
  candidate_email: string;
  candidate_phone: string | null;
  resume_url: string | null;
  linkedin_url: string | null;
  note_to_recruiter: string | null;
  tracking_token: string;
  status: ReferralStatus;
  application_id: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MyReferral = {
  id: string;
  candidate_name: string;
  candidate_email: string;
  job_id: string;
  job_title: string;
  coarse_status: CoarseStatus;
  created_at: string;
  updated_at: string;
};

export type AdminReferralRow = CandidateReferral & {
  job_title: string;
  referrer_name: string | null;
};

export type ReferrableJob = {
  id: string;
  title: string;
  department_name: string | null;
  location_type: string | null;
  employment_type: string | null;
};

// ---- helpers ------------------------------------------------------------

function featureFlagOff(): ActionResult<never> {
  return { success: false, error: "Referrals are not enabled" };
}

async function getReferrerContext() {
  const user = await getCurrentUser();
  if (!user) return null;
  return user;
}

function generateToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

// ---- public reads -------------------------------------------------------

export async function getReferrableJobs(): Promise<ActionResult<ReferrableJob[]>> {
  if (!isReferralsEnabled()) return featureFlagOff();
  const user = await getReferrerContext();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const [{ data: jobs, error }, { data: depts }] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, title, department_id, location_type, employment_type")
      .eq("org_id", user.orgId)
      .eq("status", "active")
      .order("created_at", { ascending: false }),
    supabase.from("departments").select("id, name").eq("org_id", user.orgId),
  ]);
  if (error) return { success: false, error: error.message };

  const deptMap = new Map<string, string>((depts ?? []).map((d: any) => [d.id, d.name]));
  const result: ReferrableJob[] = (jobs ?? []).map((j: any) => ({
    id: j.id,
    title: j.title,
    department_name: j.department_id ? (deptMap.get(j.department_id) ?? null) : null,
    location_type: j.location_type ?? null,
    employment_type: j.employment_type ?? null,
  }));
  return { success: true, data: result };
}

export async function getReferrableJob(jobId: string): Promise<ActionResult<ReferrableJob>> {
  if (!isReferralsEnabled()) return featureFlagOff();
  const user = await getReferrerContext();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const { data: job, error } = await supabase
    .from("jobs")
    .select("id, title, department_id, location_type, employment_type, status")
    .eq("id", jobId)
    .eq("org_id", user.orgId)
    .single();
  if (error || !job) return { success: false, error: "Job not found" };
  if ((job as any).status !== "active") return { success: false, error: "This role is no longer accepting applications" };

  const deptId = (job as any).department_id;
  let deptName: string | null = null;
  if (deptId) {
    const { data: d } = await supabase
      .from("departments")
      .select("name")
      .eq("id", deptId)
      .single();
    deptName = (d as any)?.name ?? null;
  }

  return {
    success: true,
    data: {
      id: (job as any).id,
      title: (job as any).title,
      department_name: deptName,
      location_type: (job as any).location_type ?? null,
      employment_type: (job as any).employment_type ?? null,
    },
  };
}

export async function listMyReferrals(): Promise<ActionResult<MyReferral[]>> {
  if (!isReferralsEnabled()) return featureFlagOff();
  const user = await getReferrerContext();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const { data: rows, error } = await supabase
    .from("candidate_referrals")
    .select("id, candidate_name, candidate_email, job_id, status, created_at, updated_at")
    .eq("org_id", user.orgId)
    .eq("referrer_clerk_user_id", user.clerkUserId)
    .order("created_at", { ascending: false });
  if (error) return { success: false, error: error.message };

  const jobIds = Array.from(new Set((rows ?? []).map((r: any) => r.job_id)));
  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, title")
    .in("id", jobIds.length ? jobIds : [""]);
  const jobMap = new Map<string, string>((jobs ?? []).map((j: any) => [j.id, j.title]));

  const result: MyReferral[] = (rows ?? []).map((r: any) => ({
    id: r.id,
    candidate_name: r.candidate_name,
    candidate_email: r.candidate_email,
    job_id: r.job_id,
    job_title: jobMap.get(r.job_id) ?? "—",
    coarse_status: toCoarse(r.status as ReferralStatus),
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
  return { success: true, data: result };
}

// ---- admin reads --------------------------------------------------------

export async function listOrgReferrals(): Promise<ActionResult<AdminReferralRow[]>> {
  if (!isReferralsEnabled()) return featureFlagOff();
  const user = await getReferrerContext();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };

  const supabase = createAdminSupabase();
  const { data: rows, error } = await supabase
    .from("candidate_referrals")
    .select("*")
    .eq("org_id", user.orgId)
    .order("created_at", { ascending: false });
  if (error) return { success: false, error: error.message };

  const jobIds = Array.from(new Set((rows ?? []).map((r: any) => r.job_id)));
  const employeeIds = Array.from(
    new Set((rows ?? []).map((r: any) => r.referrer_employee_id).filter(Boolean)),
  );

  const [{ data: jobs }, { data: employees }] = await Promise.all([
    supabase.from("jobs").select("id, title").in("id", jobIds.length ? jobIds : [""]),
    supabase
      .from("employees")
      .select("id, first_name, last_name")
      .in("id", employeeIds.length ? employeeIds : [""]),
  ]);

  const jobMap = new Map<string, string>((jobs ?? []).map((j: any) => [j.id, j.title]));
  const empMap = new Map<string, string>(
    (employees ?? []).map((e: any) => [e.id, `${e.first_name} ${e.last_name}`.trim()]),
  );

  const result: AdminReferralRow[] = (rows ?? []).map((r: any) => ({
    ...(r as CandidateReferral),
    job_title: jobMap.get(r.job_id) ?? "—",
    referrer_name: r.referrer_employee_id ? (empMap.get(r.referrer_employee_id) ?? null) : null,
  }));
  return { success: true, data: result };
}

export async function getReferralForAdmin(id: string): Promise<ActionResult<AdminReferralRow>> {
  if (!isReferralsEnabled()) return featureFlagOff();
  const user = await getReferrerContext();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };

  const supabase = createAdminSupabase();
  const { data: row, error } = await supabase
    .from("candidate_referrals")
    .select("*")
    .eq("id", id)
    .eq("org_id", user.orgId)
    .single();
  if (error || !row) return { success: false, error: "Referral not found" };

  const r = row as CandidateReferral;
  const [{ data: job }, employee] = await Promise.all([
    supabase.from("jobs").select("title").eq("id", r.job_id).single(),
    r.referrer_employee_id
      ? supabase
          .from("employees")
          .select("first_name, last_name")
          .eq("id", r.referrer_employee_id)
          .single()
      : Promise.resolve({ data: null as any }),
  ]);

  const empData = (employee as any)?.data;
  const referrerName = empData ? `${empData.first_name} ${empData.last_name}`.trim() : null;

  return {
    success: true,
    data: {
      ...r,
      job_title: (job as any)?.title ?? "—",
      referrer_name: referrerName,
    },
  };
}

// ---- public token-scoped read (for /apply/r/[token]) --------------------

export async function getReferralByToken(
  token: string,
): Promise<ActionResult<{
  referral_id: string;
  candidate_name: string;
  candidate_email: string;
  candidate_phone: string | null;
  linkedin_url: string | null;
  resume_url: string | null;
  job_id: string;
  job_title: string;
  job_status: string;
  org_name: string;
  org_slug: string;
  referrer_first_name: string | null;
  status: ReferralStatus;
}>> {
  if (!isReferralsEnabled()) return featureFlagOff();

  const supabase = createAdminSupabase();
  const { data: row, error } = await supabase
    .from("candidate_referrals")
    .select("*")
    .eq("tracking_token", token)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!row) return { success: false, error: "Referral link not found" };

  const r = row as CandidateReferral;
  const [{ data: job }, { data: org }, employee] = await Promise.all([
    supabase.from("jobs").select("title, status").eq("id", r.job_id).single(),
    supabase.from("organizations").select("name, slug").eq("id", r.org_id).single(),
    r.referrer_employee_id
      ? supabase
          .from("employees")
          .select("first_name")
          .eq("id", r.referrer_employee_id)
          .single()
      : Promise.resolve({ data: null as any }),
  ]);

  const empData = (employee as any)?.data;

  return {
    success: true,
    data: {
      referral_id: r.id,
      candidate_name: r.candidate_name,
      candidate_email: r.candidate_email,
      candidate_phone: r.candidate_phone,
      linkedin_url: r.linkedin_url,
      resume_url: r.resume_url,
      job_id: r.job_id,
      job_title: (job as any)?.title ?? "—",
      job_status: (job as any)?.status ?? "closed",
      org_name: (org as any)?.name ?? "",
      org_slug: (org as any)?.slug ?? "",
      referrer_first_name: empData?.first_name ?? null,
      status: r.status,
    },
  };
}

// ---- mutations ----------------------------------------------------------

const SubmitReferralSchema = z.object({
  jobId: z.string().uuid(),
  candidate_name: z.string().min(1).max(120),
  candidate_email: z.string().email(),
  candidate_phone: z.string().max(40).optional(),
  resume_url: z.string().url().optional(),
  linkedin_url: z.string().url().optional(),
  note_to_recruiter: z.string().max(2000).optional(),
});

export async function submitReferral(
  input: z.infer<typeof SubmitReferralSchema>,
): Promise<ActionResult<{ id: string }>> {
  if (!isReferralsEnabled()) return featureFlagOff();
  const user = await getReferrerContext();
  if (!user) return { success: false, error: "Not authenticated" };

  const parsed = SubmitReferralSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message };
  const data = parsed.data;

  const supabase = createAdminSupabase();

  // Verify job belongs to user's org and is active
  const { data: job } = await supabase
    .from("jobs")
    .select("id, status, org_id")
    .eq("id", data.jobId)
    .eq("org_id", user.orgId)
    .single();
  if (!job) return { success: false, error: "Job not found" };
  if ((job as any).status !== "active") {
    return { success: false, error: "This role is no longer accepting applications" };
  }

  // Self-referral check: candidate email must not match referrer's employee email
  if (user.employeeId) {
    const { data: me } = await supabase
      .from("employees")
      .select("email")
      .eq("id", user.employeeId)
      .single();
    if (me && (me as any).email && (me as any).email.toLowerCase() === data.candidate_email.toLowerCase()) {
      return { success: false, error: "Self-referrals are not allowed" };
    }
  }

  // Duplicate-active check (the unique partial index also enforces this; this
  // gives a friendlier error message)
  const { data: existing } = await supabase
    .from("candidate_referrals")
    .select("id")
    .eq("org_id", user.orgId)
    .eq("job_id", data.jobId)
    .ilike("candidate_email", data.candidate_email)
    .not("status", "in", "(rejected,withdrawn)")
    .maybeSingle();
  if (existing) {
    return { success: false, error: "This candidate has already been referred for this role" };
  }

  const token = generateToken();

  const { data: insertRow, error: insertErr } = await supabase
    .from("candidate_referrals")
    .insert({
      org_id: user.orgId,
      job_id: data.jobId,
      referrer_employee_id: user.employeeId,
      referrer_clerk_user_id: user.clerkUserId,
      candidate_name: data.candidate_name,
      candidate_email: data.candidate_email,
      candidate_phone: data.candidate_phone ?? null,
      resume_url: data.resume_url ?? null,
      linkedin_url: data.linkedin_url ?? null,
      note_to_recruiter: data.note_to_recruiter ?? null,
      tracking_token: token,
      status: "pending_apply",
    })
    .select("id")
    .single();
  if (insertErr || !insertRow) {
    return { success: false, error: insertErr?.message ?? "Failed to create referral" };
  }
  const referralId = (insertRow as { id: string }).id;

  // Send invite email to candidate (best-effort; failures don't roll back the row)
  await sendReferralInvite({
    candidateName: data.candidate_name,
    candidateEmail: data.candidate_email,
    jobId: data.jobId,
    token,
    referrerEmployeeId: user.employeeId,
    orgId: user.orgId,
  }).catch(() => {
    // swallow; admins can resend from the inbox if needed (future)
  });

  // Notify org admins (best-effort)
  await notifyAdminsOfReferral({
    candidateName: data.candidate_name,
    candidateEmail: data.candidate_email,
    jobId: data.jobId,
    referrerEmployeeId: user.employeeId,
    noteToRecruiter: data.note_to_recruiter ?? null,
    orgId: user.orgId,
  }).catch(() => {});

  revalidatePath("/dashboard/refer");
  revalidatePath("/dashboard/refer/my-referrals");
  revalidatePath("/hire/referrals");

  return { success: true, data: { id: referralId } };
}

async function sendReferralInvite(args: {
  candidateName: string;
  candidateEmail: string;
  jobId: string;
  token: string;
  referrerEmployeeId: string | null;
  orgId: string;
}) {
  if (!process.env.RESEND_API_KEY) return;
  const supabase = createAdminSupabase();
  const [{ data: job }, { data: org }, referrer] = await Promise.all([
    supabase.from("jobs").select("title").eq("id", args.jobId).single(),
    supabase.from("organizations").select("name").eq("id", args.orgId).single(),
    args.referrerEmployeeId
      ? supabase
          .from("employees")
          .select("first_name, last_name")
          .eq("id", args.referrerEmployeeId)
          .single()
      : Promise.resolve({ data: null as any }),
  ]);
  const referrerData = (referrer as any)?.data;
  const referrerFirstName = referrerData?.first_name ?? "Someone";
  const orgName = (org as any)?.name ?? "us";
  const jobTitle = (job as any)?.title ?? "an open role";
  const applyUrl = `https://jambahr.com/apply/r/${args.token}`;

  const html = await render(
    ReferralInviteEmail({
      candidateName: args.candidateName,
      referrerFirstName,
      orgName,
      jobTitle,
      applyUrl,
    }),
  );

  await resend.emails.send({
    from: NOREPLY_EMAIL,
    replyTo: FROM_EMAIL,
    to: args.candidateEmail,
    subject: `${referrerFirstName} referred you for ${jobTitle} at ${orgName}`,
    html,
  });
}

async function notifyAdminsOfReferral(args: {
  candidateName: string;
  candidateEmail: string;
  jobId: string;
  referrerEmployeeId: string | null;
  noteToRecruiter: string | null;
  orgId: string;
}) {
  if (!process.env.RESEND_API_KEY) return;
  const supabase = createAdminSupabase();

  const [{ data: admins }, { data: job }, referrer] = await Promise.all([
    supabase
      .from("employees")
      .select("email")
      .eq("org_id", args.orgId)
      .in("role", ["owner", "admin"])
      .neq("status", "terminated"),
    supabase.from("jobs").select("title").eq("id", args.jobId).single(),
    args.referrerEmployeeId
      ? supabase
          .from("employees")
          .select("first_name, last_name")
          .eq("id", args.referrerEmployeeId)
          .single()
      : Promise.resolve({ data: null as any }),
  ]);

  const adminEmails = ((admins ?? []) as { email: string | null }[])
    .map((a) => a.email)
    .filter((e): e is string => typeof e === "string" && e.length > 0);
  if (adminEmails.length === 0) return;

  const referrerData = (referrer as any)?.data;
  const referrerName = referrerData
    ? `${referrerData.first_name ?? ""} ${referrerData.last_name ?? ""}`.trim()
    : "An employee";
  const jobTitle = (job as any)?.title ?? "an open role";

  const html = await render(
    ReferralReceivedEmail({
      candidateName: args.candidateName,
      candidateEmail: args.candidateEmail,
      jobTitle,
      referrerName: referrerName || "An employee",
      noteToRecruiter: args.noteToRecruiter,
      inboxUrl: "https://jambahr.com/hire/referrals",
    }),
  );

  await resend.emails.send({
    from: FROM_EMAIL,
    to: adminEmails,
    subject: `New referral: ${args.candidateName} for ${jobTitle}`,
    html,
  });
}

export async function withdrawReferral(id: string): Promise<ActionResult<void>> {
  if (!isReferralsEnabled()) return featureFlagOff();
  const user = await getReferrerContext();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const { data: row } = await supabase
    .from("candidate_referrals")
    .select("id, status, referrer_clerk_user_id")
    .eq("id", id)
    .eq("org_id", user.orgId)
    .single();
  if (!row) return { success: false, error: "Referral not found" };

  const r = row as { id: string; status: ReferralStatus; referrer_clerk_user_id: string };
  const isReferrer = r.referrer_clerk_user_id === user.clerkUserId;
  const adminUser = isAdmin(user.role);

  if (!adminUser && !isReferrer) return { success: false, error: "Unauthorized" };
  // Referrer can only withdraw before interview stage; admin can always withdraw.
  if (!adminUser && (r.status === "interview" || r.status === "offer" || r.status === "hired")) {
    return { success: false, error: "Cannot withdraw — candidate is past interview stage. Contact your admin." };
  }
  if (r.status === "hired") return { success: false, error: "Cannot withdraw a hired referral" };

  const { error } = await supabase
    .from("candidate_referrals")
    .update({ status: "withdrawn" })
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/refer/my-referrals");
  revalidatePath("/hire/referrals");
  return { success: true, data: undefined };
}

// ---- public apply (called from /apply/r/[token] page) -------------------

const SubmitApplicationForReferralSchema = z.object({
  token: z.string().min(10),
  candidate_name: z.string().min(1).max(120),
  candidate_email: z.string().email(),
  candidate_phone: z.string().max(40).optional(),
  resume_url: z.string().url().optional(),
  linkedin_url: z.string().url().optional(),
  cover_letter: z.string().max(5000).optional(),
});

export async function submitApplicationForReferral(
  input: z.infer<typeof SubmitApplicationForReferralSchema>,
): Promise<ActionResult<{ application_id: string }>> {
  if (!isReferralsEnabled()) return featureFlagOff();

  const parsed = SubmitApplicationForReferralSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message };
  const data = parsed.data;

  const supabase = createAdminSupabase();
  const { data: referral } = await supabase
    .from("candidate_referrals")
    .select("*")
    .eq("tracking_token", data.token)
    .maybeSingle();
  if (!referral) return { success: false, error: "Referral link not found" };

  const r = referral as CandidateReferral;

  // Job status guard
  const { data: job } = await supabase
    .from("jobs")
    .select("status")
    .eq("id", r.job_id)
    .single();
  if (!job || (job as any).status !== "active") {
    return { success: false, error: "This role is no longer accepting applications" };
  }

  if (r.application_id) {
    return { success: false, error: "This referral has already been applied to" };
  }

  // Find or create the candidate row for this org
  const { data: existingCandidate } = await supabase
    .from("candidates")
    .select("id")
    .eq("org_id", r.org_id)
    .ilike("email", data.candidate_email)
    .maybeSingle();

  let candidateId = (existingCandidate as { id: string } | null)?.id ?? null;
  if (!candidateId) {
    const { data: newCandidate, error: candErr } = await supabase
      .from("candidates")
      .insert({
        org_id: r.org_id,
        name: data.candidate_name,
        email: data.candidate_email,
        phone: data.candidate_phone ?? null,
        resume_url: data.resume_url ?? r.resume_url ?? null,
        linkedin_url: data.linkedin_url ?? r.linkedin_url ?? null,
        source: "referral",
      })
      .select("id")
      .single();
    if (candErr || !newCandidate) {
      return { success: false, error: candErr?.message ?? "Failed to create candidate" };
    }
    candidateId = (newCandidate as { id: string }).id;
  }

  // Create the application row
  const { data: application, error: appErr } = await supabase
    .from("applications")
    .insert({
      org_id: r.org_id,
      job_id: r.job_id,
      candidate_id: candidateId,
      stage: "applied",
      cover_letter: data.cover_letter ?? null,
    })
    .select("id")
    .single();
  if (appErr || !application) {
    return { success: false, error: appErr?.message ?? "Failed to create application" };
  }
  const applicationId = (application as { id: string }).id;

  // Link back to the referral
  await supabase
    .from("candidate_referrals")
    .update({
      application_id: applicationId,
      status: "applied",
      submitted_at: new Date().toISOString(),
    })
    .eq("id", r.id);

  revalidatePath("/hire/referrals");
  revalidatePath("/dashboard/refer/my-referrals");

  return { success: true, data: { application_id: applicationId } };
}
