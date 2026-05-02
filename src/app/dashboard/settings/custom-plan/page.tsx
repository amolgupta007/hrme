import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { getMyCustomPlanRequest } from "@/actions/custom-plan";
import { createAdminSupabase } from "@/lib/supabase/server";
import { CustomPlanPicker } from "@/components/settings/custom-plan-picker";
import { CustomPlanStatusView } from "@/components/settings/custom-plan-status-view";

export const dynamic = "force-dynamic";

async function getActiveEmployeeCount(orgId: string): Promise<number> {
  const supabase = createAdminSupabase();
  const { count } = await supabase
    .from("employees")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("status", "active");
  return count ?? 0;
}

export default async function CustomPlanPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!isAdmin(user.role)) redirect("/dashboard/settings");

  const [reqResult, employeeCount] = await Promise.all([
    getMyCustomPlanRequest(),
    getActiveEmployeeCount(user.orgId),
  ]);
  const request = reqResult.success ? reqResult.data : null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link
        href="/dashboard/settings"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Settings
      </Link>
      <h1 className="text-2xl font-bold tracking-tight mt-4 mb-2">Custom Plan</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Pick only the features you need. We&apos;ll review your request within 1 business day.
      </p>

      {request ? (
        <CustomPlanStatusView request={request} employeeCount={employeeCount} />
      ) : (
        <CustomPlanPicker employeeCount={employeeCount} />
      )}
    </main>
  );
}
