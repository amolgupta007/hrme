"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { createAdminSupabase } from "@/lib/supabase/server";

async function getClerkOrgId(): Promise<string | null> {
  const { orgId, userId } = auth();
  if (orgId) return orgId;
  if (!userId) return null;
  const client = await clerkClient();
  const memberships = await client.users.getOrganizationMembershipList({ userId });
  return memberships.data[0]?.organization.id ?? null;
}

export async function getDashboardStats() {
  const clerkOrgId = await getClerkOrgId();
  if (!clerkOrgId) return null;

  const supabase = createAdminSupabase();

  const { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (!org) return null;

  const orgId = org.id;

  const [
    { count: totalEmployees },
    { count: pendingLeaves },
    { count: totalEnrollments },
    { count: completedEnrollments },
    { count: overdueEnrollments },
  ] = await Promise.all([
    supabase
      .from("employees")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "active"),
    supabase
      .from("leave_requests")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "pending"),
    supabase
      .from("training_enrollments")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId),
    supabase
      .from("training_enrollments")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "completed"),
    supabase
      .from("training_enrollments")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "overdue"),
  ]);

  const trainingPct =
    (totalEnrollments ?? 0) > 0
      ? Math.round(((completedEnrollments ?? 0) / (totalEnrollments ?? 1)) * 100)
      : 0;

  return {
    totalEmployees: totalEmployees ?? 0,
    pendingLeaves: pendingLeaves ?? 0,
    trainingCompletion: trainingPct,
    complianceAlerts: overdueEnrollments ?? 0,
  };
}
