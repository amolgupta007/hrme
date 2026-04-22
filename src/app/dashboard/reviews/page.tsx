import { listReviewCycles, listCycleReviews, listMyReviews } from "@/actions/reviews";
import { listEmployees } from "@/actions/employees";
import { getCurrentUser } from "@/lib/current-user";
import { getPerformanceSettings } from "@/lib/performance-settings";
import { ReviewsClient } from "@/components/reviews/reviews-client";
import { UpgradeGate } from "@/components/layout/upgrade-gate";
import { hasFeature } from "@/config/plans";
import { createAdminSupabase } from "@/lib/supabase/server";

export default async function ReviewsPage() {
  const userCtx = await getCurrentUser();
  const plan = userCtx?.plan ?? "starter";

  if (!hasFeature(plan, "reviews")) {
    return <UpgradeGate feature="Performance Reviews" requiredPlan="growth" currentPlan={plan} />;
  }

  const role = userCtx?.role ?? "employee";
  const employeeId = userCtx?.employeeId ?? null;

  const supabase = createAdminSupabase();
  const { data: org } = userCtx
    ? await supabase.from("organizations").select("settings").eq("id", userCtx.orgId).single()
    : { data: null };
  const performanceSettings = getPerformanceSettings((org as any)?.settings ?? null);

  const isEmployee = role === "employee";

  if (isEmployee) {
    const myReviewsResult = await listMyReviews();
    const myReviews = myReviewsResult.success ? myReviewsResult.data : [];
    return (
      <div className="space-y-6">
        <ReviewsClient
          cycles={[]}
          employees={[]}
          cycleReviews={[]}
          activeCycleId={null}
          role={role}
          employeeId={employeeId}
          myReviews={myReviews}
          performanceSettings={performanceSettings}
        />
      </div>
    );
  }

  const [cyclesResult, employeesResult] = await Promise.all([
    listReviewCycles(),
    listEmployees(),
  ]);

  const cycles = cyclesResult.success ? cyclesResult.data : [];
  const employees = employeesResult.success ? employeesResult.data : [];

  const activeCycle = cycles.find((c) => c.status === "active") ?? cycles[0] ?? null;
  const reviewsResult = activeCycle
    ? await listCycleReviews(activeCycle.id, { role, employeeId })
    : null;
  const cycleReviews = reviewsResult?.success ? reviewsResult.data : [];

  return (
    <div className="space-y-6">
      <ReviewsClient
        cycles={cycles}
        employees={employees}
        cycleReviews={cycleReviews}
        activeCycleId={null}
        role={role}
        employeeId={employeeId}
        myReviews={[]}
        performanceSettings={performanceSettings}
      />
    </div>
  );
}
