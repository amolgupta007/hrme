"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { createAdminSupabase } from "@/lib/supabase/server";

async function getOrgContext() {
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
  const { data } = await supabase
    .from("organizations")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (!data) return null;
  return { orgId: data.id, clerkUserId: userId };
}

export type PendingCounts = {
  leaves: number;
  documents: number;
};

export async function getPendingCounts(): Promise<PendingCounts> {
  const ctx = await getOrgContext();
  if (!ctx) return { leaves: 0, documents: 0 };

  const supabase = createAdminSupabase();

  const [leavesResult, docsResult] = await Promise.all([
    // Pending leave requests awaiting approval
    supabase
      .from("leave_requests")
      .select("*", { count: "exact", head: true })
      .eq("org_id", ctx.orgId)
      .eq("status", "pending"),

    // Documents requiring acknowledgment
    supabase
      .from("documents")
      .select("*", { count: "exact", head: true })
      .eq("org_id", ctx.orgId)
      .eq("requires_acknowledgment", true),
  ]);

  return {
    leaves: leavesResult.count ?? 0,
    documents: docsResult.count ?? 0,
  };
}
