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
 * Returns the current user's org context including their role and plan.
 * Org is resolved from the caller's employees rows + active-org cookie.
 * Clerk is used only for userId (no sessionOrgId / Clerk org membership).
 */
export async function getCurrentUser(): Promise<UserContext | null> {
  const { userId } = auth();
  if (!userId) return null;

  const supabase = createAdminSupabase();

  async function loadMemberships() {
    const { data } = await supabase
      .from("employees")
      .select(
        "id, role, first_name, employment_type, org_id, organizations!inner(id, name, plan, settings, custom_features)"
      )
      .eq("clerk_user_id", userId as string)
      .neq("status", "terminated")
      .order("created_at", { ascending: true });
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

  // Resolve the active org via cookie, falling back to the first membership
  const cookieOrg = cookies().get(ACTIVE_ORG_COOKIE)?.value ?? null;
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
 * Resolves via the employees-table membership + active-org cookie.
 * Use getCurrentUser() when you also need role/plan/employeeId.
 */
export async function getOrgContext(): Promise<{ orgId: string; clerkUserId: string } | null> {
  const { userId } = auth();
  if (!userId) return null;

  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from("employees")
    .select("org_id")
    .eq("clerk_user_id", userId)
    .neq("status", "terminated")
    .order("created_at", { ascending: true });

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
