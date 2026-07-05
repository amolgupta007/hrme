import { createAdminSupabase } from "@/lib/supabase/server";
import { applicationStageToReferralStatus, type ReferralStatus } from "@/lib/referrals/status";

/**
 * Update the referral linked to an application. Best-effort: failures are
 * swallowed so a glitch in the referrals system never blocks core hire ops.
 *
 * Called from src/actions/hire.ts whenever an application's stage changes
 * (drag in pipeline, reject, hire). Only updates rows whose status is still
 * "active" (i.e. not already rejected/withdrawn) — admin manual overrides
 * via the inbox win.
 */
export async function syncReferralFromApplicationStage(
  applicationId: string,
  applicationStage: string,
): Promise<void> {
  try {
    const supabase = createAdminSupabase();
    const newStatus: ReferralStatus = applicationStageToReferralStatus(applicationStage);

    await supabase
      .from("candidate_referrals")
      .update({ status: newStatus })
      .eq("application_id", applicationId)
      .not("status", "in", "(rejected,withdrawn,hired)");
  } catch {
    // Intentionally swallow; the hire mutation already succeeded by the time we get here.
  }
}

/**
 * Mark a referral as rejected explicitly (used when an application is rejected).
 */
export async function markReferralRejectedByApplication(
  applicationId: string,
): Promise<void> {
  try {
    const supabase = createAdminSupabase();
    await supabase
      .from("candidate_referrals")
      .update({ status: "rejected" })
      .eq("application_id", applicationId)
      .not("status", "in", "(rejected,withdrawn,hired)");
  } catch {
    // swallow
  }
}
