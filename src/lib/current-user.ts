import { auth, clerkClient } from "@clerk/nextjs/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import type { UserRole } from "@/types";
import type { OrgPlan } from "@/config/plans";

export type UserContext = {
  orgId: string;
  clerkUserId: string;
  role: UserRole;
  employeeId: string | null;
  plan: OrgPlan;
  customFeatures: string[] | null;
  jambaHireEnabled: boolean;
  attendanceEnabled: boolean;
  attendancePayrollEnabled: boolean;
  grievancesEnabled: boolean;
};

async function resolveClerkOrg(
  userId: string,
  sessionOrgId: string | null | undefined
): Promise<{ orgId: string; clerkOrgId: string } | null> {
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
  return { orgId: (data as { id: string }).id, clerkOrgId };
}

/**
 * Returns the current user's org context including their role and plan.
 * Falls back to "admin" role and "starter" plan if no employee record found.
 */
export async function getCurrentUser(): Promise<UserContext | null> {
  const { orgId: sessionOrgId, userId } = auth();
  if (!userId) return null;

  const resolved = await resolveClerkOrg(userId, sessionOrgId);
  if (!resolved) return null;

  const supabase = createAdminSupabase();
  const { data: org } = await supabase
    .from("organizations")
    .select("id, plan, settings, custom_features")
    .eq("clerk_org_id", resolved.clerkOrgId)
    .single();
  if (!org) return null;

  const orgId = resolved.orgId;
  const plan = ((org as any).plan as OrgPlan) ?? "starter";
  const settings = ((org as any).settings as any) ?? {};
  const rawCustomFeatures = (org as any).custom_features;
  const customFeatures: string[] | null = Array.isArray(rawCustomFeatures)
    ? (rawCustomFeatures as string[])
    : null;
  const jambaHireEnabled = !!settings?.jambahire_enabled;
  const attendanceEnabled = !!settings?.attendance_enabled;
  const attendancePayrollEnabled = !!settings?.attendance_payroll_enabled;
  const grievancesEnabled = !!settings?.grievances_enabled;

  let { data: emp } = await supabase
    .from("employees")
    .select("id, role")
    .eq("clerk_user_id", userId)
    .eq("org_id", orgId)
    .single();

  // Webhook race fallback: a freshly-invited employee can hit the dashboard
  // before Clerk's organizationMembership.created webhook has linked their
  // clerk_user_id. Match by email and back-fill the link so subsequent
  // requests resolve correctly. Without this we'd drop them into the
  // admin-default branch and render the wrong sidebar.
  if (!emp) {
    try {
      const client = await clerkClient();
      const clerkUser = await client.users.getUser(userId);
      const email =
        clerkUser.primaryEmailAddress?.emailAddress ??
        clerkUser.emailAddresses?.[0]?.emailAddress ??
        null;

      if (email) {
        const { data: empByEmail } = await supabase
          .from("employees")
          .select("id, role")
          .eq("org_id", orgId)
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
          emp = empByEmail as any;
        }
      }
    } catch (err) {
      console.warn("getCurrentUser email-fallback lookup failed:", err);
    }
  }

  const role: UserRole = emp
    ? ((emp as { id: string; role: string }).role as UserRole)
    : "admin";
  const employeeId = emp ? (emp as { id: string; role: string }).id : null;

  return { orgId, clerkUserId: userId, role, employeeId, plan, customFeatures, jambaHireEnabled, attendanceEnabled, attendancePayrollEnabled, grievancesEnabled };
}

export function isAdmin(role: UserRole): boolean {
  return role === "owner" || role === "admin";
}

export function isManagerOrAbove(role: UserRole): boolean {
  return role === "owner" || role === "admin" || role === "manager";
}

/**
 * Lightweight org context — orgId + clerkUserId.
 * Use getCurrentUser() when you also need role/plan/employeeId.
 */
export async function getOrgContext(): Promise<{ orgId: string; clerkUserId: string } | null> {
  const { orgId: sessionOrgId, userId } = auth();
  if (!userId) return null;

  const resolved = await resolveClerkOrg(userId, sessionOrgId);
  if (!resolved) return null;

  return { orgId: resolved.orgId, clerkUserId: userId };
}
