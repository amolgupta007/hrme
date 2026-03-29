import { auth, clerkClient } from "@clerk/nextjs/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { listCourses, listMyEnrollments } from "@/actions/training";
import { listEmployees } from "@/actions/employees";
import { TrainingClient } from "@/components/training/training-client";
import { getCurrentUser } from "@/lib/current-user";
import { UpgradeGate } from "@/components/layout/upgrade-gate";
import { hasFeature } from "@/config/plans";

async function getRole(): Promise<{ role: string } | null> {
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

  const { data: emp } = await supabase
    .from("employees")
    .select("role")
    .eq("clerk_user_id", userId)
    .eq("org_id", (org as { id: string }).id)
    .single();

  return emp ? { role: (emp as { role: string }).role } : null;
}

export default async function TrainingPage() {
  const userCtx = await getCurrentUser();
  const plan = userCtx?.plan ?? "starter";

  if (!hasFeature(plan, "training")) {
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
