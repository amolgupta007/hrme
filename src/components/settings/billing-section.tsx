import { BillingStatusCard } from "@/components/settings/billing-status-card";
import { PlanManagementCard } from "@/components/settings/plan-management-card";
import { InvoicesCard } from "@/components/settings/invoices-card";
import { BillingDetailsCard } from "@/components/settings/billing-details-card";
import type { OrgProfile } from "@/actions/settings";

interface BillingSectionProps {
  profile: OrgProfile;
}

export function BillingSection({ profile }: BillingSectionProps) {
  return (
    <div className="space-y-4">
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
