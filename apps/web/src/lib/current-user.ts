import { auth, clerkClient } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { normalizePhone } from "@/lib/phone";
import { createAdminSupabase } from "@/lib/supabase/server";
import { resolveActiveOrg, ACTIVE_ORG_COOKIE } from "@/lib/auth/active-org";
import type { UserRole } from "@/types";
import type { OrgPlan } from "@/config/plans";

export type UserContext = {
  orgId: string;
  orgName: string;
  clerkUserId: string;
  role: UserRole;
  employeeId: string | null;
  firstName: string | null;
  employmentType: "full_time" | "part_time" | "contract" | "intern" | null;
  plan: OrgPlan;
  customFeatures: string[] | null;
  jambaHireEnabled: boolean;
  assistantEnabled: boolean;
  assistantTenantDocsEnabled: boolean;
  attendanceEnabled: boolean;
  attendancePayrollEnabled: boolean;
  grievancesEnabled: boolean;
  jambaGeoEnabled: boolean;
};

/**
 * Thrown when the membership lookup itself FAILS (database unreachable, query
 * rejected) — as opposed to succeeding and finding no rows.
 *
 * The distinction matters enormously. A `null` UserContext means "this account
 * belongs to no org", which the app renders as "No workspace found for this
 * account" plus a prompt to go ask an admin for an invite. Reporting that when
 * the database merely timed out tells an owner their entire company is gone.
 * So a failed lookup fails LOUDLY and the caller decides how to surface it;
 * only a genuinely empty result returns null.
 */
export class MembershipLookupError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "MembershipLookupError";
    this.cause = cause;
  }
}

/** Narrow an unknown caught value to a membership-lookup failure. */
export function isMembershipLookupError(
  err: unknown
): err is MembershipLookupError {
  if (err instanceof MembershipLookupError) return true;
  // Name check as a backstop: class identity can be lost across bundle
  // boundaries, and mistaking this for a real "no membership" is the exact
  // failure being fixed here.
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: unknown }).name === "MembershipLookupError"
  );
}

/**
 * Returns the current user's org context including their role and plan.
 * Org is resolved from the caller's employees rows + active-org cookie.
 * Clerk is used only for userId (no sessionOrgId / Clerk org membership).
 *
 * Returns null when the caller is signed in but belongs to no org.
 * Throws {@link MembershipLookupError} when membership could not be read at all.
 */
export async function getCurrentUser(
  opts?: { orgIdHint?: string | null }
): Promise<UserContext | null> {
  const { userId } = auth();
  if (!userId) return null;

  const supabase = createAdminSupabase();

  async function loadMemberships() {
    const { data, error } = await supabase
      .from("employees")
      .select(
        "id, role, first_name, employment_type, org_id, organizations!inner(id, name, plan, settings, custom_features)"
      )
      .eq("clerk_user_id", userId as string)
      .neq("status", "terminated")
      .order("created_at", { ascending: true });
    // Do NOT fall through to `data ?? []` on error — an unreachable database
    // would read as "this user has no orgs" and strand every signed-in user,
    // owners included, on the /onboarding "no workspace found" wall.
    if (error) {
      throw new MembershipLookupError(
        "Could not read org memberships from the database",
        error
      );
    }
    return (data ?? []) as any[];
  }

  let memberships = await loadMemberships();

  // Webhook race fallback: a freshly-invited employee can hit the dashboard
  // before Clerk's organizationMembership.created webhook has linked their
  // clerk_user_id. Match by email/phone and back-fill the link so subsequent
  // requests resolve correctly.
  if (memberships.length === 0) {
    try {
      const client = await clerkClient();
      const clerkUser = await client.users.getUser(userId);
      const email =
        clerkUser.primaryEmailAddress?.emailAddress ??
        clerkUser.emailAddresses?.[0]?.emailAddress ??
        null;

      let linked = false;

      if (email) {
        const { data: empByEmail } = await supabase
          .from("employees")
          .select("id, role, first_name, org_id")
          .eq("email", email)
          .is("clerk_user_id", null)
          .neq("status", "terminated")
          .limit(1)
          .maybeSingle();

        if (empByEmail) {
          await supabase
            .from("employees")
            .update({ clerk_user_id: userId })
            .eq("id", (empByEmail as { id: string }).id);
          linked = true;
        }
      }

      // Phone fallback: phone-only Clerk users have no email address.
      // Reuse the already-fetched clerkUser — do NOT call getUser again.
      // Only runs when email did NOT link, to avoid double-linking two different
      // unlinked rows (potentially in different orgs).
      if (!linked) {
        const phone =
          normalizePhone(clerkUser.primaryPhoneNumber?.phoneNumber) ??
          normalizePhone(clerkUser.phoneNumbers?.[0]?.phoneNumber);
        if (phone) {
          const { data: empByPhone } = await supabase
            .from("employees")
            .select("id, role, first_name, org_id")
            .eq("phone", phone)
            .is("clerk_user_id", null)
            .neq("status", "terminated")
            .limit(1)
            .maybeSingle();
          if (empByPhone) {
            await supabase
              .from("employees")
              .update({ clerk_user_id: userId })
              .eq("id", (empByPhone as { id: string }).id);
          }
        }
      }
    } catch (err) {
      console.warn("getCurrentUser email/phone-fallback lookup failed:", err);
    }

    // Re-load after back-filling clerk_user_id
    memberships = await loadMemberships();
  }

  // Signed-in user with no org membership → route to /onboarding
  if (memberships.length === 0) return null;

  // Mobile BFF passes the org via X-Org-Id header instead of the cookie.
  // Either way the value is only a hint — resolveActiveOrg validates it
  // against real memberships, so a forged header/cookie can't widen access.
  const cookieOrg =
    opts?.orgIdHint ?? cookies().get(ACTIVE_ORG_COOKIE)?.value ?? null;
  const activeOrgId = resolveActiveOrg(
    memberships.map((m) => ({ orgId: m.org_id as string })),
    cookieOrg
  );
  const active = memberships.find((m) => m.org_id === activeOrgId)!;
  const org = (active as any).organizations as any;

  const orgId: string = org.id;
  const orgName: string = (org.name as string) ?? "your organisation";
  const plan: OrgPlan = (org.plan as OrgPlan) ?? "starter";
  const settings: any = (org.settings as any) ?? {};
  const rawCustomFeatures = org.custom_features;
  const customFeatures: string[] | null = Array.isArray(rawCustomFeatures)
    ? (rawCustomFeatures as string[])
    : null;

  const jambaHireEnabled = !!settings?.jambahire_enabled;
  const assistantEnabled = !!settings?.assistant_enabled;
  const assistantTenantDocsEnabled = !!settings?.assistant_tenant_docs_enabled;
  const attendanceEnabled = !!settings?.attendance_enabled;
  const attendancePayrollEnabled = !!settings?.attendance_payroll_enabled;
  const grievancesEnabled = !!settings?.grievances_enabled;
  const jambaGeoEnabled = !!settings?.jambageo_enabled;

  const role: UserRole = active.role as UserRole;
  const employeeId: string | null = active.id;
  const firstName: string | null = active.first_name;
  const employmentType = (active.employment_type ?? null) as "full_time" | "part_time" | "contract" | "intern" | null;

  return {
    orgId,
    orgName,
    clerkUserId: userId,
    role,
    employeeId,
    firstName,
    employmentType,
    plan,
    customFeatures,
    jambaHireEnabled,
    assistantEnabled,
    assistantTenantDocsEnabled,
    attendanceEnabled,
    attendancePayrollEnabled,
    grievancesEnabled,
    jambaGeoEnabled,
  };
}

export function isAdmin(role: UserRole): boolean {
  return role === "owner" || role === "admin";
}

export function isManagerOrAbove(role: UserRole): boolean {
  return role === "owner" || role === "admin" || role === "manager";
}

/**
 * Lightweight org context — orgId + clerkUserId.
 * Throws {@link MembershipLookupError} when membership could not be read.
 * Resolves via the employees-table membership + active-org cookie.
 * Use getCurrentUser() when you also need role/plan/employeeId.
 */
export async function getOrgContext(): Promise<{ orgId: string; clerkUserId: string } | null> {
  const { userId } = auth();
  if (!userId) return null;

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("employees")
    .select("org_id")
    .eq("clerk_user_id", userId)
    .neq("status", "terminated")
    .order("created_at", { ascending: true });

  // Same contract as getCurrentUser: a failed read is not an empty read.
  if (error) {
    throw new MembershipLookupError(
      "Could not read org memberships from the database",
      error
    );
  }

  const rows = (data ?? []) as { org_id: string }[];
  if (rows.length === 0) return null;

  const cookieOrg = cookies().get(ACTIVE_ORG_COOKIE)?.value ?? null;
  const activeOrgId = resolveActiveOrg(
    rows.map((r) => ({ orgId: r.org_id })),
    cookieOrg
  );
  if (!activeOrgId) return null;

  return { orgId: activeOrgId, clerkUserId: userId };
}
