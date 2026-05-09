import { getCurrentUser, isAdmin, type UserContext } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";

export type JambaHireDenyReason =
  | "no_user"
  | "feature_disabled"
  | "role_forbidden";

export type JambaHireAccessResult =
  | { allowed: true; user: UserContext }
  | { allowed: false; reason: JambaHireDenyReason };

/**
 * Admin-tier access check for /hire/* — owners and admins only,
 * gated behind organizations.settings.jambahire_enabled.
 *
 * Use the `reason` to drive page-level redirects:
 *   no_user          → /sign-in
 *   feature_disabled → /dashboard/settings
 *   role_forbidden   → /dashboard
 */
export async function requireJambaHireAccess(): Promise<JambaHireAccessResult> {
  const user = await getCurrentUser();
  if (!user) return { allowed: false, reason: "no_user" };
  if (!user.jambaHireEnabled) return { allowed: false, reason: "feature_disabled" };
  if (!isAdmin(user.role)) return { allowed: false, reason: "role_forbidden" };
  return { allowed: true, user };
}

/**
 * Server-action wrapper. Returns the user on success or an
 * ActionResult-shaped failure on deny. Callers do:
 *
 *   const gate = await assertJambaHireAccess();
 *   if ("error" in gate) return { success: false, error: gate.error };
 *   const { user } = gate;
 */
export async function assertJambaHireAccess(): Promise<
  { user: UserContext } | { error: string }
> {
  const result = await requireJambaHireAccess();
  if (result.allowed) return { user: result.user };
  return { error: errorForReason(result.reason) };
}

function errorForReason(reason: JambaHireDenyReason): string {
  switch (reason) {
    case "no_user":
      return "Not authenticated";
    case "feature_disabled":
      return "JambaHire is not enabled for this organization";
    case "role_forbidden":
      return "Unauthorized";
  }
}

export type InterviewerDenyReason =
  | "no_user"
  | "feature_disabled"
  | "not_interviewer";

export type InterviewerAccessResult =
  | { allowed: true; user: UserContext }
  | { allowed: false; reason: InterviewerDenyReason };

/**
 * Slim interviewer access — admins always pass; everyone else passes
 * only if they have at least one interview assignment (or, when
 * scheduleId is supplied, only if THIS schedule is assigned to them).
 */
export async function requireInterviewerAccess(
  scheduleId?: string,
): Promise<InterviewerAccessResult> {
  const user = await getCurrentUser();
  if (!user) return { allowed: false, reason: "no_user" };
  if (!user.jambaHireEnabled) return { allowed: false, reason: "feature_disabled" };
  if (isAdmin(user.role)) return { allowed: true, user };

  if (!user.employeeId) return { allowed: false, reason: "not_interviewer" };

  const supabase = createAdminSupabase();

  if (scheduleId) {
    const { data } = await supabase
      .from("interview_schedules")
      .select("id")
      .eq("id", scheduleId)
      .eq("interviewer_id", user.employeeId)
      .maybeSingle();
    if (!data) return { allowed: false, reason: "not_interviewer" };
    return { allowed: true, user };
  }

  const { data } = await supabase
    .from("interview_schedules")
    .select("id")
    .eq("interviewer_id", user.employeeId)
    .limit(1)
    .maybeSingle();
  if (!data) return { allowed: false, reason: "not_interviewer" };
  return { allowed: true, user };
}

export async function assertInterviewerAccess(
  scheduleId: string,
): Promise<{ user: UserContext } | { error: string }> {
  const result = await requireInterviewerAccess(scheduleId);
  if (result.allowed) return { user: result.user };
  switch (result.reason) {
    case "no_user":
      return { error: "Not authenticated" };
    case "feature_disabled":
      return { error: "JambaHire is not enabled for this organization" };
    case "not_interviewer":
      return { error: "Unauthorized" };
  }
}
