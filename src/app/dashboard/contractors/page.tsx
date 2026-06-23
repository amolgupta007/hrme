import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { hasFeature } from "@/config/plans";
import { UpgradeGate } from "@/components/layout/upgrade-gate";
import { listContractorEngagements } from "@/actions/contractors";
import { listAssignableContractors } from "@/actions/contractors";
import { ContractorsClient } from "@/components/contractors/contractors-client";

export default async function ContractorsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!isAdmin(user.role)) redirect("/dashboard");

  if (!hasFeature(user.plan, "payroll", user.customFeatures ?? null)) {
    return (
      <UpgradeGate
        feature="Contractor Payments"
        requiredPlan="business"
        currentPlan={user.plan}
      />
    );
  }

  const [engRes, assignableRes] = await Promise.all([
    listContractorEngagements(),
    listAssignableContractors(),
  ]);

  const engagements = engRes.success ? engRes.data : [];
  const assignableContractors = assignableRes.success ? assignableRes.data : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Contractors</h1>
        <p className="mt-1 text-muted-foreground">
          Manage contractor engagements and process TDS-compliant payments.
        </p>
      </div>
      <ContractorsClient
        engagements={engagements}
        assignableContractors={assignableContractors}
      />
    </div>
  );
}
