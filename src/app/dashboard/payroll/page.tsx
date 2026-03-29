import { getCurrentUser } from "@/lib/current-user";
import { UpgradeGate } from "@/components/layout/upgrade-gate";
import { hasFeature } from "@/config/plans";

export default async function PayrollPage() {
  const userCtx = await getCurrentUser();
  const plan = userCtx?.plan ?? "starter";

  if (!hasFeature(plan, "payroll")) {
    return <UpgradeGate feature="Payroll & Compensation" requiredPlan="business" currentPlan={plan} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Payroll & Compensation
        </h1>
        <p className="mt-1 text-muted-foreground">
          Salary structures, payslips, bonuses, and tax calculations.
        </p>
      </div>

      <div className="rounded-xl border border-dashed border-border p-12 text-center">
        <p className="text-muted-foreground">
          Payroll management will appear here. This is a Phase 3 feature.
        </p>
      </div>
    </div>
  );
}
