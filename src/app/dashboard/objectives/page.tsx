import { listMyObjectives, listPendingApprovals, listAllObjectives } from "@/actions/objectives";
import { ObjectivesClient } from "@/components/objectives/objectives-client";
import { getCurrentUser } from "@/lib/current-user";
import { UpgradeGate } from "@/components/layout/upgrade-gate";
import { hasFeature } from "@/config/plans";
import { createAdminSupabase } from "@/lib/supabase/server";

export default async function ObjectivesPage() {
  const userCtx = await getCurrentUser();
  const plan = userCtx?.plan ?? "starter";

  if (!hasFeature(plan, "objectives")) {
    return <UpgradeGate feature="Objectives & OKRs" requiredPlan="growth" currentPlan={plan} />;
  }

  const [myResult, approvalsResult, allResult] = await Promise.all([
    listMyObjectives(),
    listPendingApprovals(),
    listAllObjectives(),
  ]);

  const myObjectives = myResult.success ? myResult.data : [];
  const pendingApprovals = approvalsResult.success ? approvalsResult.data : [];
  const allObjectives = allResult.success ? allResult.data : [];
  const isAdminUser = userCtx?.role === "admin" || userCtx?.role === "owner";

  // Check if employee has direct reports
  let hasDirectReports = false;
  if (userCtx?.employeeId) {
    const supabase = createAdminSupabase();
    const { count } = await supabase
      .from("employees")
      .select("*", { count: "exact", head: true })
      .eq("reporting_manager_id", userCtx.employeeId)
      .eq("org_id", userCtx.orgId);
    hasDirectReports = (count ?? 0) > 0;
  }

  return (
    <div className="space-y-6">
      <ObjectivesClient
        myObjectives={myObjectives}
        pendingApprovals={pendingApprovals}
        allObjectives={allObjectives}
        isAdmin={isAdminUser}
        hasDirectReports={hasDirectReports}
      />
    </div>
  );
}
