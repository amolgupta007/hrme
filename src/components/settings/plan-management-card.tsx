"use client";

import { useState } from "react";
import { Loader2, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createSubscription, cancelSubscription, pollBillingActivation } from "@/actions/billing";
import {
  PLATFORM_FEES,
  PER_EMPLOYEE_MONTHLY_RATE,
  ANNUAL_MULTIPLIER,
  formatPaise,
  computePlatformFeeDelta,
} from "@/config/billing";
import type { OrgPlan } from "@/config/plans";
import type { BillingCycle } from "@/types";

declare global {
  interface Window {
    Razorpay: any;
  }
}

interface PlanManagementCardProps {
  currentPlan: OrgPlan;
  currentCycle: BillingCycle | null;
  platformFeePaid: number;
  employeeCount: number;
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

async function pollUntilActivated(expectedPlan: "growth" | "business"): Promise<boolean> {
  const start = Date.now();
  const TIMEOUT_MS = 30_000;
  const INTERVAL_MS = 2_000;
  while (Date.now() - start < TIMEOUT_MS) {
    const r = await pollBillingActivation({ expectedPlan });
    if (r.success && r.data.activated) return true;
    await new Promise((res) => setTimeout(res, INTERVAL_MS));
  }
  return false;
}

export function PlanManagementCard({
  currentPlan,
  currentCycle,
  platformFeePaid,
  employeeCount,
}: PlanManagementCardProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);

  async function handleUpgrade(planKey: "growth" | "business", cycle: BillingCycle) {
    setLoading(`${planKey}_${cycle}`);
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded) {
        toast.error("Failed to load payment gateway. Please try again.");
        return;
      }

      const result = await createSubscription({ planKey, billingCycle: cycle, employeeCount });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      const { subscriptionId, keyId } = result.data;

      const rzp = new window.Razorpay({
        key: keyId,
        subscription_id: subscriptionId,
        name: "JambaHR",
        description: `${planKey === "business" ? "Business" : "Growth"} Plan (${cycle})`,
        image: "/Jamba.png",
        theme: { color: "#0f7068" },
        handler: async () => {
          toast.loading("Activating your subscription...", { id: "activation" });
          const activated = await pollUntilActivated(planKey);
          toast.dismiss("activation");
          if (activated) {
            toast.success("Subscription activated.");
            window.location.reload();
          } else {
            toast.error("Activation is taking longer than expected. Refresh in a minute or contact support.");
            setLoading(null);
          }
        },
        modal: { ondismiss: () => setLoading(null) },
      });
      rzp.open();
    } catch (error) {
      console.error(error);
      toast.error("Something went wrong. Please try again.");
      setLoading(null);
    }
  }

  async function handleCancel() {
    setShowCancel(false);
    setLoading("cancel");
    try {
      const result = await cancelSubscription();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Subscription cancelled. You'll keep access until the end of this billing cycle.");
    } finally {
      setLoading(null);
    }
  }

  const upgradeOptions: Array<{
    planKey: "growth" | "business";
    cycle: BillingCycle;
    label: string;
    amount: number;
    delta: number;
  }> = [];
  for (const planKey of ["growth", "business"] as const) {
    if (planKey === currentPlan) continue;
    for (const cycle of ["monthly", "annual"] as const) {
      const recurring =
        PER_EMPLOYEE_MONTHLY_RATE[planKey] *
        employeeCount *
        (cycle === "annual" ? ANNUAL_MULTIPLIER : 1);
      const delta = computePlatformFeeDelta(PLATFORM_FEES[planKey], platformFeePaid);
      upgradeOptions.push({
        planKey,
        cycle,
        label: `${planKey === "business" ? "Business" : "Growth"} — ${cycle === "annual" ? "Annual" : "Monthly"}`,
        amount: recurring,
        delta,
      });
    }
  }

  const showSwitchCycle =
    currentPlan !== "starter" && currentPlan !== "custom" && currentCycle !== null;

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h3 className="font-semibold mb-4">Plan Management</h3>

      <div className="space-y-3">
        {upgradeOptions.map((opt) => (
          <div
            key={`${opt.planKey}_${opt.cycle}`}
            className="flex items-center justify-between gap-4 p-3 rounded-lg border border-border"
          >
            <div>
              <p className="text-sm font-medium">{opt.label}</p>
              <p className="text-xs text-muted-foreground">
                {opt.delta > 0
                  ? `${formatPaise(opt.delta)} platform fee + ${formatPaise(opt.amount)}/${opt.cycle === "annual" ? "year" : "month"}`
                  : `${formatPaise(opt.amount)}/${opt.cycle === "annual" ? "year" : "month"}`}
                {" + GST"}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={loading !== null}
              onClick={() => handleUpgrade(opt.planKey, opt.cycle)}
            >
              {loading === `${opt.planKey}_${opt.cycle}` ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowRight className="mr-1.5 h-3.5 w-3.5" />
              )}
              Upgrade
            </Button>
          </div>
        ))}

        {showSwitchCycle && currentCycle === "monthly" && (
          <div className="flex items-center justify-between gap-4 p-3 rounded-lg border border-amber-300/60 bg-amber-50/40 dark:bg-amber-900/10">
            <div>
              <p className="text-sm font-medium">Switch to Annual billing</p>
              <p className="text-xs text-muted-foreground">
                Save 2 months. The change takes effect on your next billing date.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={loading !== null}
              onClick={() =>
                handleUpgrade(currentPlan as "growth" | "business", "annual")
              }
            >
              Switch
            </Button>
          </div>
        )}

        {currentPlan !== "starter" && (
          <div className="flex items-center justify-between gap-4 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
            <div>
              <p className="text-sm font-medium">Cancel subscription</p>
              <p className="text-xs text-muted-foreground">
                You&apos;ll retain access until the end of your current billing cycle.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
              disabled={loading !== null}
              onClick={() => setShowCancel(true)}
            >
              <X className="mr-1.5 h-3.5 w-3.5" />
              Cancel
            </Button>
          </div>
        )}
      </div>

      {showCancel && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-background rounded-lg p-6 max-w-md w-full">
            <h4 className="font-semibold mb-2">Cancel your subscription?</h4>
            <p className="text-sm text-muted-foreground mb-4">
              Your subscription will be cancelled at the end of your current billing cycle. You&apos;ll keep
              full access to all paid features until then. No partial refunds.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowCancel(false)}>
                Keep subscription
              </Button>
              <Button
                variant="outline"
                className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                onClick={handleCancel}
              >
                Yes, cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
