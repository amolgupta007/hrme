"use client";

import Link from "next/link";
import { CheckCircle2, Circle, ChevronRight, PartyPopper } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OnboardingStatusResult } from "@/config/onboarding";

export function OnboardingCard({ status }: { status: OnboardingStatusResult }) {
  // Don't render if all required steps are done AND all enabled steps are done
  if (status.allRequiredComplete && status.totalComplete === status.totalEnabled) {
    return null;
  }

  const progressPct =
    status.totalEnabled > 0
      ? Math.round((status.totalComplete / status.totalEnabled) * 100)
      : 100;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            Complete your setup
          </p>
          <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
            {status.totalComplete} of {status.totalEnabled} steps done
          </p>
          {/* Progress bar */}
          <div className="mt-2 h-1.5 w-full rounded-full bg-amber-200 dark:bg-amber-800">
            <div
              className="h-1.5 rounded-full bg-amber-500 transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
        {status.allRequiredComplete && (
          <PartyPopper className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
        )}
      </div>

      <ul className="mt-3 space-y-1.5">
        {status.steps.map((step) => (
          <li key={step.id}>
            {step.complete ? (
              <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                <span className="line-through opacity-60">{step.label}</span>
                {step.required && (
                  <span className="ml-auto text-xs text-green-600 font-medium">Done</span>
                )}
              </div>
            ) : (
              <Link
                href={step.actionUrl}
                className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200 hover:text-primary transition-colors"
              >
                <Circle className="h-4 w-4 text-amber-400 shrink-0" />
                <span>{step.label}</span>
                {step.required && (
                  <span className="ml-auto text-xs text-amber-600 font-medium shrink-0">Required</span>
                )}
                <ChevronRight className={cn("h-3 w-3 shrink-0", step.required ? "" : "ml-auto")} />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
