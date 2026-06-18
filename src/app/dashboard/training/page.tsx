import { auth, clerkClient } from "@clerk/nextjs/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { listCourses, listMyEnrollments } from "@/actions/training";
import { listEmployees } from "@/actions/employees";
import { TrainingClient } from "@/components/training/training-client";
import { getCurrentUser } from "@/lib/current-user";
import { UpgradeGate } from "@/components/layout/upgrade-gate";
import { hasFeature } from "@/config/plans";

async function getRole(): Promise<{ role: string } | null> {
  const user = await getCurrentUser();
  return user ? { role: user.role } : null;
}

export default async function TrainingPage() {
  const userCtx = await getCurrentUser();
  const plan = userCtx?.plan ?? "starter";

  if (!hasFeature(plan, "training", userCtx?.customFeatures ?? null)) {
    return <UpgradeGate feature="Training & Compliance" requiredPlan="growth" currentPlan={plan} />;
  }

  const [roleCtx, coursesResult, enrollmentsResult, employeesResult] = await Promise.all([
    getRole(),
    listCourses(),
    listMyEnrollments(),
    listEmployees(),
  ]);

  const courses = coursesResult.success ? coursesResult.data : [];
  const myEnrollments = enrollmentsResult.success ? enrollmentsResult.data : [];
  const employees = employeesResult.success ? employeesResult.data : [];
  const isAdmin =
    roleCtx?.role === "admin" ||
    roleCtx?.role === "owner" ||
    roleCtx?.role === "manager";

  return (
    <div className="space-y-6">
      <TrainingClient
        courses={courses}
        myEnrollments={myEnrollments}
        employees={employees}
        isAdmin={isAdmin}
      />
    </div>
  );
}
