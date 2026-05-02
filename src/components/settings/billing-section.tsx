import { BillingStatusCard } from "@/components/settings/billing-status-card";
import { PlanManagementCard } from "@/components/settings/plan-management-card";
import { InvoicesCard } from "@/components/settings/invoices-card";
import { BillingDetailsCard } from "@/components/settings/billing-details-card";
import { CustomPlanRequestBanner } from "@/components/settings/custom-plan-request-banner";
import { getMyCustomPlanRequest } from "@/actions/custom-plan";
import type { OrgProfile } from "@/actions/settings";

interface BillingSectionProps {
  profile: OrgProfile;
}

export async function BillingSection({ profile }: BillingSectionProps) {
  const reqResult = await getMyCustomPlanRequest();
  const customRequest = reqResult.success ? reqResult.data : null;

  return (
    <div className="space-y-4">
      {customRequest && customRequest.status !== "rejected" && (
        <CustomPlanRequestBanner request={customRequest} />
      )}

      <BillingStatusCard />

      <PlanManagementCard
        currentPlan={profile.plan as "starter" | "growth" | "business" | "custom"}
        currentCycle={profile.billing_cycle ?? null}
        platformFeePaid={profile.platform_fee_paid ?? 0}
        employeeCount={profile.employee_count}
      />

      <InvoicesCard />

      <BillingDetailsCard />
    </div>
  );
}
