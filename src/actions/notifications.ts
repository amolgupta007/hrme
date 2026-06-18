"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/current-user";
import { getPendingObjectivesCount } from "@/actions/objectives";

async function getOrgContext() {
  const { userId } = auth();
  const user = await getCurrentUser();
  if (!userId || !user) return null;
  return { orgId: user.orgId!, clerkUserId: userId };
}

export type PendingCounts = {
  leaves: number;
  documents: number;
  objectives: number;
};

export async function getPendingCounts(): Promise<PendingCounts> {
  const ctx = await getOrgContext();
  if (!ctx) return { leaves: 0, documents: 0, objectives: 0 };

  const supabase = createAdminSupabase();

  // Find current employee ID for acknowledgment check
  const { data: me } = await supabase
    .from("employees")
    .select("id")
    .eq("org_id", ctx.orgId)
    .eq("clerk_user_id", ctx.clerkUserId)
    .single();
  const myEmployeeId = (me as { id: string } | null)?.id ?? null;

  const [leavesResult, docsResult, acksResult, objectivesCount] = await Promise.all([
    supabase
      .from("leave_requests")
      .select("*", { count: "exact", head: true })
      .eq("org_id", ctx.orgId)
      .eq("status", "pending"),
    supabase
      .from("documents")
      .select("id")
      .eq("org_id", ctx.orgId)
      .eq("requires_acknowledgment", true),
    myEmployeeId
      ? supabase
          .from("document_acknowledgments")
          .select("document_id")
          .eq("org_id", ctx.orgId)
          .eq("employee_id", myEmployeeId)
      : Promise.resolve({ data: [] }),
    getPendingObjectivesCount(ctx.orgId, ctx.clerkUserId),
  ]);

  const ackedIds = new Set(((acksResult as any).data ?? []).map((a: any) => a.document_id));
  const unacknowledgedDocs = (docsResult.data ?? []).filter((d: any) => !ackedIds.has(d.id)).length;

  return {
    leaves: leavesResult.count ?? 0,
    documents: unacknowledgedDocs,
    objectives: objectivesCount,
  };
}
