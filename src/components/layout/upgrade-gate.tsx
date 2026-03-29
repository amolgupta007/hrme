import Link from "next/link";
import { Lock, CheckCircle2, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLAN_LABELS, PLAN_UNLOCK_HIGHLIGHTS } from "@/config/plans";
import type { OrgPlan } from "@/config/plans";

interface UpgradeGateProps {
  feature: string;
  requiredPlan: "growth" | "business";
  currentPlan: OrgPlan;
}

export function UpgradeGate({ feature, requiredPlan, currentPlan }: UpgradeGateProps) {
  const highlights = PLAN_UNLOCK_HIGHLIGHTS[requiredPlan];
  const planLabel = PLAN_LABELS[requiredPlan];
  const currentLabel = PLAN_LABELS[currentPlan];

  return (
    <div className="flex flex-1 flex-col items-center justify-center py-20 px-6 text-center">
      <div className="max-w-md w-full">
        {/* Icon */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <Lock className="h-7 w-7 text-muted-foreground" />
        </div>

        {/* Heading */}
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
          <Sparkles className="h-3 w-3" />
          {planLabel} Plan Feature
        </div>

        <h1 className="mt-4 text-2xl font-bold tracking-tight">{feature} is locked</h1>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          You&apos;re currently on the <strong>{currentLabel}</strong> plan.
          Upgrade to <strong>{planLabel}</strong> to unlock {feature.toLowerCase()} and more.
        </p>

        {/* What's included */}
        <div className="mt-8 rounded-xl border border-border bg-muted/30 p-5 text-left">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {planLabel} plan includes
          </p>
          <ul className="space-y-2.5">
            {highlights.map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="text-sm text-foreground">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* CTA */}
        <div className="mt-6 flex flex-col gap-3">
          <Button asChild size="lg" className="w-full">
            <Link href="/dashboard/settings#billing">
              Upgrade to {planLabel}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <p className="text-xs text-muted-foreground">
            Billed monthly via Razorpay · Cancel anytime
          </p>
        </div>
      </div>
    </div>
  );
}
