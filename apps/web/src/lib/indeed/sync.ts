import { createAdminSupabase } from "@/lib/supabase/server";
import { getIndeedClient } from "./index";
import { mapJobToIndeed } from "./job-mapper";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://jambahr.com";

/** Push (or expire) one job to Indeed and persist sync state. Never throws. */
export async function pushJobToIndeed(jobId: string): Promise<void> {
  const supabase = createAdminSupabase();
  try {
    const { data: job, error } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", jobId)
      .single();
    if (error || !job) return;
    // Fast path: nothing to do for a job that was never opted in and never posted.
    // (A previously-posted job that is now disabled must still be expired below.)
    if (!(job as any).indeed_enabled && !(job as any).indeed_job_id) return;

    const { data: org } = await supabase
      .from("organizations")
      .select("name, slug, settings")
      .eq("id", (job as any).org_id)
      .single();

    const orgRow = org as any;
    const slug = orgRow?.slug || (job as any).org_id; // organizations.slug — same key /careers/[slug] uses
    const contactEmail = orgRow?.settings?.hire_contact_email || "support@jambahr.com";
    const client = getIndeedClient();

    const status = (job as any).status as string;
    const shouldBeLive = (job as any).indeed_enabled && status === "active";

    if (shouldBeLive) {
      const { indeedJobId } = await client.upsertJob(
        mapJobToIndeed(job as any, {
          companyName: orgRow?.name ?? "Company",
          contactEmail,
          applyUrl: `${APP_URL}/careers/${slug}`,
          postUrl: `${APP_URL}/api/webhooks/indeed`,
        })
      );
      await supabase
        .from("jobs")
        .update({
          indeed_job_id: indeedJobId,
          indeed_status: "posted",
          indeed_synced_at: new Date().toISOString(),
          indeed_sync_error: null,
        })
        .eq("id", jobId);
    } else {
      const postingId = (job as any).indeed_job_id;
      if (postingId) {
        await client.expireJob(postingId);
      }
      await supabase
        .from("jobs")
        .update({
          indeed_status: "expired",
          indeed_synced_at: new Date().toISOString(),
          indeed_sync_error: null,
        })
        .eq("id", jobId);
    }
  } catch (err) {
    console.error("[indeed] pushJobToIndeed failed", jobId, err);
    try {
      await supabase
        .from("jobs")
        .update({
          indeed_status: "error",
          indeed_sync_error: err instanceof Error ? err.message : String(err),
        })
        .eq("id", jobId);
    } catch (writeErr) {
      console.error("[indeed] could not persist Indeed error state", jobId, writeErr);
    }
  }
}

/** Fire-and-forget — safe to pass to waitUntil(). */
export function maybePushJobToIndeed(jobId: string): void {
  void pushJobToIndeed(jobId);
}
