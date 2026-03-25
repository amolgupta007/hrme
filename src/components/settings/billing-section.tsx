"use client";

import { CreditCard, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OrgProfile } from "@/actions/settings";

const PLAN_INFO = {
  starter: {
    label: "Starter",
    price: "Free",
    color: "bg-muted text-muted-foreground",
    features: ["Up to 10 employees", "Directory & Leave", "Basic documents"],
  },
  growth: {
    label: "Growth",
    price: "$5 / employee / month",
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    features: ["Up to 200 employees", "Reviews & Training", "Compliance tracking"],
  },
  business: {
    label: "Business",
    price: "$8 / employee / month",
    color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    features: ["Up to 500 employees", "Payroll & Analytics", "API access & Priority support"],
  },
};

interface BillingSectionProps {
  profile: OrgProfile;
}

export function BillingSection({ profile }: BillingSectionProps) {
  const plan = PLAN_INFO[profile.plan] ?? PLAN_INFO.starter;
  const usagePct = Math.min(100, Math.round((profile.employee_count / profile.max_employees) * 100));
  const nearLimit = usagePct >= 80;

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-5">
        <CreditCard className="h-5 w-5 text-muted-foreground" />
        <h3 className="font-semibold">Billing & Plan</h3>
      </div>

      <div className="space-y-5">
        {/* Current plan */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Current Plan</p>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${plan.color}`}>
                {plan.label}
              </span>
              <span className="text-sm text-muted-foreground">{plan.price}</span>
            </div>
            <ul className="mt-2 space-y-1">
              {plan.features.map((f) => (
                <li key={f} className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-muted-foreground/60 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
          {profile.plan !== "business" && (
            <Button size="sm" variant="outline" disabled className="shrink-0">
              <Zap className="mr-1.5 h-3.5 w-3.5" />
              Upgrade
            </Button>
          )}
        </div>

        {/* Employee usage */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs text-muted-foreground">Employee Seats</p>
            <p className="text-xs font-medium">
              {profile.employee_count} / {profile.max_employees}
            </p>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${nearLimit ? "bg-amber-500" : "bg-primary"}`}
              style={{ width: `${usagePct}%` }}
            />
          </div>
          {nearLimit && (
            <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
              You&apos;re using {usagePct}% of your employee seats. Consider upgrading soon.
            </p>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Billing management via Stripe will be available after deployment.
        </p>
      </div>
    </div>
  );
}
