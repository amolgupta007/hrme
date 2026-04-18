"use client";

import React from "react";
import { toast } from "sonner";
import { updateOnboardingSteps } from "@/actions/settings";
import { STEP_LABELS, DEFAULT_ONBOARDING_STEPS, type OnboardingStepConfig } from "@/config/onboarding";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export function OnboardingStepsSection({
  initialSteps,
}: {
  initialSteps: OnboardingStepConfig[];
}) {
  const [steps, setSteps] = React.useState<OnboardingStepConfig[]>(initialSteps);
  const [saving, setSaving] = React.useState(false);

  // Merge with defaults to ensure all step IDs are present
  const allSteps = DEFAULT_ONBOARDING_STEPS.map((def) => {
    return steps.find((s) => s.id === def.id) ?? def;
  });

  function toggleEnabled(id: OnboardingStepConfig["id"]) {
    setSteps((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, enabled: !s.enabled, required: s.enabled ? false : s.required }
          : s
      )
    );
  }

  function toggleRequired(id: OnboardingStepConfig["id"]) {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, required: !s.required } : s))
    );
  }

  async function handleSave() {
    setSaving(true);
    const result = await updateOnboardingSteps(allSteps);
    setSaving(false);
    if (result.success) {
      toast.success("Onboarding steps updated");
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Employee Onboarding Checklist</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Choose which steps appear in new employees&apos; onboarding checklist.
          Required steps must be completed to dismiss the card.
        </p>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-border">
          {allSteps.map((step) => (
            <div key={step.id} className="flex items-center justify-between py-3 gap-4">
              <p className="text-sm font-medium">{STEP_LABELS[step.id]}</p>
              <div className="flex items-center gap-6 shrink-0">
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={step.enabled}
                    onChange={() => toggleEnabled(step.id)}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                  Enabled
                </label>
                <label className={`flex items-center gap-2 text-xs cursor-pointer select-none ${!step.enabled ? "opacity-40 pointer-events-none" : "text-muted-foreground"}`}>
                  <input
                    type="checkbox"
                    checked={step.required}
                    onChange={() => toggleRequired(step.id)}
                    disabled={!step.enabled}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                  Required
                </label>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
