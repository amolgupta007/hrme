import { auth, clerkClient } from "@clerk/nextjs/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { listMyObjectives, listPendingApprovals, listAllObjectives } from "@/actions/objectives";
import { ObjectivesClient } from "@/components/objectives/objectives-client";
import { getCurrentUser } from "@/lib/current-user";
import { UpgradeGate } from "@/components/layout/upgrade-gate";
import { hasFeature } from "@/config/plans";

async function getContext() {
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
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (!org) return null;
  const orgId = (org as { id: string }).id;

  const { data: emp } = await supabase
    .from("employees")
    .select("id, role")
    .eq("clerk_user_id", userId)
    .eq("org_id", orgId)
    .single();

  if (!emp) return null;
  const empData = emp as { id: string; role: string };

  // Check if this employee has direct reports
  const { count: directReports } = await supabase
    .from("employees")
    .select("*", { count: "exact", head: true })
    .eq("reporting_manager_id", empData.id)
    .eq("org_id", orgId);

  return {
    role: empData.role,
    hasDirectReports: (directReports ?? 0) > 0,
  };
}

export default async function ObjectivesPage() {
  const userCtx = await getCurrentUser();
  const plan = userCtx?.plan ?? "starter";

  if (!hasFeature(plan, "objectives")) {
    return <UpgradeGate feature="Objectives & OKRs" requiredPlan="growth" currentPlan={plan} />;
  }

  const [ctx, myResult, approvalsResult, allResult] = await Promise.all([
    getContext(),
    listMyObjectives(),
    listPendingApprovals(),
    listAllObjectives(),
  ]);

  const myObjectives = myResult.success ? myResult.data : [];
  const pendingApprovals = approvalsResult.success ? approvalsResult.data : [];
  const allObjectives = allResult.success ? allResult.data : [];
  const isAdmin = ctx?.role === "admin" || ctx?.role === "owner";
  const hasDirectReports = ctx?.hasDirectReports ?? false;

  return (
    <div className="space-y-6">
      <ObjectivesClient
        myObjectives={myObjectives}
        pendingApprovals={pendingApprovals}
        allObjectives={allObjectives}
        isAdmin={isAdmin}
        hasDirectReports={hasDirectReports}
      />
    </div>
  );
}
