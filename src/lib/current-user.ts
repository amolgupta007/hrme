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
  jambaHireEnabled: boolean;
};

/**
 * Returns the current user's org context including their role and plan.
 * Falls back to "admin" role and "starter" plan if no employee record found.
 */
export async function getCurrentUser(): Promise<UserContext | null> {
  const { orgId: sessionOrgId, userId } = auth();
  if (!userId) return null;

  let clerkOrgId = sessionOrgId ?? null;
  if (!clerkOrgId) {
    const client = await clerkClient();
    const memberships = await client.users.getOrganizationMembershipList({ userId });
    clerkOrgId = memberships.data[0]?.organization.id ?? null;
  }
  if (!clerkOrgId) return null;

  const supabase = createAdminSupabase();
  const { data: org } = await supabase
    .from("organizations")
    .select("id, plan, settings")
    .eq("clerk_org_id", clerkOrgId)
    .single();
  if (!org) return null;

  const orgId = (org as any).id;
  const plan = ((org as any).plan as OrgPlan) ?? "starter";
  const jambaHireEnabled = !!((org as any).settings as any)?.jambahire_enabled;

  const { data: emp } = await supabase
    .from("employees")
    .select("id, role")
    .eq("clerk_user_id", userId)
    .eq("org_id", orgId)
    .single();

  const role: UserRole = emp
    ? ((emp as { id: string; role: string }).role as UserRole)
    : "admin";
  const employeeId = emp ? (emp as { id: string; role: string }).id : null;

  return { orgId, clerkUserId: userId, role, employeeId, plan, jambaHireEnabled };
}

export function isAdmin(role: UserRole): boolean {
  return role === "owner" || role === "admin";
}

export function isManagerOrAbove(role: UserRole): boolean {
  return role === "owner" || role === "admin" || role === "manager";
}
