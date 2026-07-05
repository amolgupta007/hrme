"use server";

import { createHmac } from "crypto";
import { revalidatePath } from "next/cache";
import { waitUntil } from "@vercel/functions";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import { pushJobToIndeed } from "@/lib/indeed/sync";
import { indeedIsLive } from "@/lib/indeed/index";
import type { ActionResult } from "@/types";

export async function toggleIndeedPosting(
  jobId: string,
  enabled: boolean
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("jobs")
    .update({
      indeed_enabled: enabled,
      indeed_status: enabled ? "pending" : null,
      ...(enabled ? {} : { indeed_sync_error: null }),
    })
    .eq("id", jobId)
    .eq("org_id", user.orgId);
  if (error) return { success: false, error: error.message };

  waitUntil(pushJobToIndeed(jobId));
  revalidatePath("/hire/jobs");
  return { success: true, data: undefined };
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/** Dev/sandbox only: POST a realistic signed application to our own webhook. */
export async function simulateIndeedApplication(
  jobId: string
): Promise<ActionResult<{ status: number }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };
  if (indeedIsLive()) return { success: false, error: "Disabled while INDEED_LIVE=true" };

  const supabase = createAdminSupabase();
  const { data: job } = await supabase
    .from("jobs")
    .select("indeed_job_id")
    .eq("id", jobId)
    .eq("org_id", user.orgId)
    .single();
  const indeedJobId = (job as any)?.indeed_job_id;
  if (!indeedJobId) return { success: false, error: "Job not synced to Indeed yet" };

  const payload = {
    id: `sim-${Date.now()}`,
    job: { jobId: indeedJobId },
    applicant: {
      fullName: "Test Candidate",
      email: `test+${Date.now()}@example.com`,
      phoneNumber: "+919800000000",
      coverletter: "Simulated Indeed application",
      questions: [{ question: "Why this role?", answer: "Testing the pipeline" }],
    },
  };
  const body = JSON.stringify(payload);
  const signature = createHmac("sha1", process.env.INDEED_APPLY_SHARED_SECRET || "")
    .update(body)
    .digest("base64");

  const res = await fetch(`${APP_URL}/api/webhooks/indeed`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-indeed-signature": signature },
    body,
  });
  return { success: true, data: { status: res.status } };
}
