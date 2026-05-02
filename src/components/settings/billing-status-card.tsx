import { CreditCard } from "lucide-react";
import { getBillingStatus } from "@/actions/billing";
import { PLAN_LABELS, PLAN_COLORS } from "@/config/plans";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  paused: "Paused",
  halted: "Payment failed",
  pending: "Pending",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  paused: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  halted: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  pending: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  cancelled: "bg-muted text-muted-foreground",
};

export async function BillingStatusCard() {
  const result = await getBillingStatus();
  if (!result.success) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <p className="text-sm text-destructive">Could not load billing status: {result.error}</p>
      </div>
    );
  }
  const { plan, billingCycle, subscriptionStatus, maxEmployees, nextBillingAt } = result.data;

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <CreditCard className="h-5 w-5 text-muted-foreground" />
        <h3 className="font-semibold">Current Plan</h3>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Plan</p>
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${PLAN_COLORS[plan]}`}>
            {PLAN_LABELS[plan]}
          </span>
        </div>
        {subscriptionStatus && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Status</p>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[subscriptionStatus] ?? ""}`}>
              {STATUS_LABELS[subscriptionStatus] ?? subscriptionStatus}
            </span>
          </div>
        )}
        {billingCycle && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Billing Cycle</p>
            <p className="text-sm">{billingCycle === "annual" ? "Annual" : "Monthly"}</p>
          </div>
        )}
        <div>
          <p className="text-xs text-muted-foreground mb-1">Employee Cap</p>
          <p className="text-sm">{maxEmployees}</p>
        </div>
        {nextBillingAt && (
          <div className="sm:col-span-2">
            <p className="text-xs text-muted-foreground mb-1">Next Billing Date</p>
            <p className="text-sm">{formatDate(nextBillingAt)}</p>
          </div>
        )}
      </div>
    </div>
  );
}
