"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { requestCustomPlan } from "@/actions/custom-plan";
import {
  CUSTOM_PICKER_FEATURES,
  CUSTOM_PER_FEATURE_DEFAULT_RATE,
  PLATFORM_FEES,
  ANNUAL_MULTIPLIER,
  formatPaise,
} from "@/config/billing";

const FEATURE_LABELS: Record<string, { label: string; group: string }> = {
  documents: { label: "Document hub + acknowledgments", group: "Advanced HR" },
  reviews: { label: "Performance reviews", group: "Advanced HR" },
  objectives: { label: "Objectives & OKRs", group: "Advanced HR" },
  training: { label: "Training & compliance", group: "Advanced HR" },
  hiring_jd: { label: "AI job description generator", group: "Hiring" },
  payroll: { label: "Payroll (PF, PT, TDS)", group: "Operations" },
  ats: { label: "JambaHire ATS pipeline", group: "Hiring" },
  interview_scheduling: { label: "Interview scheduling", group: "Hiring" },
  offer_letters: { label: "Offer letters", group: "Hiring" },
  onboarding_workflows: { label: "Onboarding workflows", group: "Operations" },
};

interface CustomPlanPickerProps {
  employeeCount: number;
}

export function CustomPlanPicker({ employeeCount: initialEmployees }: CustomPlanPickerProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [employeeCount, setEmployeeCount] = useState<number>(Math.max(initialEmployees, 1));
  const [cycle, setCycle] = useState<"monthly" | "annual">("annual");
  const [submitting, setSubmitting] = useState(false);

  const groups = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const f of CUSTOM_PICKER_FEATURES) {
      const g = FEATURE_LABELS[f]?.group ?? "Other";
      (map[g] ??= []).push(f);
    }
    return map;
  }, []);

  const monthlyAmount = selected.size * employeeCount * CUSTOM_PER_FEATURE_DEFAULT_RATE;
  const recurringAmount = cycle === "annual" ? monthlyAmount * ANNUAL_MULTIPLIER : monthlyAmount;
  const platformFee = PLATFORM_FEES.custom;

  function toggle(feat: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(feat)) next.delete(feat);
      else next.add(feat);
      return next;
    });
  }

  async function handleSubmit() {
    if (selected.size === 0) {
      toast.error("Pick at least one feature");
      return;
    }
    setSubmitting(true);
    try {
      const result = await requestCustomPlan({
        features: Array.from(selected),
        employeeCount,
        billingCycle: cycle,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Custom plan request submitted. We'll review within 1 business day.");
      window.location.reload();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 rounded-full border border-border bg-muted/40 p-1 w-fit">
        <button
          type="button"
          onClick={() => setCycle("monthly")}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
            cycle === "monthly"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground"
          }`}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => setCycle("annual")}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
            cycle === "annual"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground"
          }`}
        >
          Annual
          <span
            className={`ml-1 text-[11px] px-1.5 py-0.5 rounded-full font-semibold ${
              cycle === "annual"
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "bg-amber-100 text-amber-800"
            }`}
          >
            Save 2 months
          </span>
        </button>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <label className="block text-sm font-medium mb-2">Active employees</label>
        <input
          type="number"
          min={1}
          max={500}
          value={employeeCount}
          onChange={(e) =>
            setEmployeeCount(Math.min(500, Math.max(1, Number(e.target.value) || 1)))
          }
          className="w-32 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Max 500. Founder may approve a different cap.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="font-semibold mb-4">Pick features</h3>
        {Object.entries(groups).map(([group, items]) => (
          <div key={group} className="mb-5 last:mb-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              {group}
            </p>
            <div className="space-y-2">
              {items.map((feat) => (
                <label
                  key={feat}
                  className="flex items-center gap-3 p-2.5 rounded-lg border border-border hover:bg-muted/40 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(feat)}
                    onChange={() => toggle(feat)}
                    className="h-4 w-4 rounded border-border accent-primary"
                  />
                  <span className="text-sm flex-1">
                    {FEATURE_LABELS[feat]?.label ?? feat}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    +₹120 / employee / month
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-primary/30 bg-primary/5 p-6">
        <h3 className="font-semibold mb-3">Estimated price</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Platform fee (one-time)</span>
            <span className="font-medium">{formatPaise(platformFee)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {selected.size} {selected.size === 1 ? "feature" : "features"} × {employeeCount} employees × ₹120
              {cycle === "annual" && " × 10 months"}
            </span>
            <span className="font-medium">
              {formatPaise(recurringAmount)} / {cycle === "annual" ? "year" : "month"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground pt-2">
            + 18% GST · Founder may adjust per-feature rate or cap
          </p>
        </div>
      </div>

      <Button
        size="lg"
        className="w-full"
        onClick={handleSubmit}
        disabled={submitting || selected.size === 0}
      >
        {submitting ? "Submitting..." : "Submit for review"}
      </Button>
    </div>
  );
}
