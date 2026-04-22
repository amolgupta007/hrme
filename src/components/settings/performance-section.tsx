"use client";

import * as React from "react";
import * as Label from "@radix-ui/react-label";
import { Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { updatePerformanceSettings } from "@/actions/settings";
import type { PerformanceSettings } from "@/lib/performance-settings";

const inputCn =
  "flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";

interface PerformanceSectionProps {
  initialSettings: PerformanceSettings;
}

export function PerformanceSection({ initialSettings }: PerformanceSectionProps) {
  const [labels, setLabels] = React.useState<[string, string, string, string, string]>(
    initialSettings.rating_labels
  );
  const [competencies, setCompetencies] = React.useState<string[]>(initialSettings.competencies);
  const [newCompetency, setNewCompetency] = React.useState("");
  const [selfReviewRequired, setSelfReviewRequired] = React.useState(initialSettings.self_review_required);
  const [loading, setLoading] = React.useState(false);

  function updateLabel(idx: number, value: string) {
    setLabels((prev) => {
      const next = [...prev] as [string, string, string, string, string];
      next[idx] = value;
      return next;
    });
  }

  function addCompetency() {
    const trimmed = newCompetency.trim();
    if (!trimmed) return;
    if (competencies.length >= 8) { toast.error("Maximum 8 competencies"); return; }
    if (competencies.includes(trimmed)) { toast.error("Already added"); return; }
    setCompetencies((prev) => [...prev, trimmed]);
    setNewCompetency("");
  }

  function removeCompetency(idx: number) {
    setCompetencies((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    if (labels.some((l) => !l.trim())) { toast.error("All rating labels must be non-empty"); return; }
    setLoading(true);
    const result = await updatePerformanceSettings({
      rating_labels: labels,
      competencies,
      self_review_required: selfReviewRequired,
    });
    setLoading(false);
    if (result.success) toast.success("Performance settings saved");
    else toast.error(result.error);
  }

  return (
    <div className="space-y-6">
      {/* Rating Labels */}
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium">Rating Labels</p>
          <p className="text-xs text-muted-foreground mt-0.5">Customise the 5-star rating labels shown in reviews.</p>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {labels.map((label, idx) => (
            <div key={idx} className="space-y-1">
              <Label.Root className="text-xs text-muted-foreground">Star {idx + 1}</Label.Root>
              <input
                className={cn(inputCn, "h-9 text-xs")}
                value={label}
                onChange={(e) => updateLabel(idx, e.target.value)}
                placeholder={`Label ${idx + 1}`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Competencies */}
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium">Competencies</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Define up to 8 competencies. When set, managers can rate each dimension in the review dialog.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {competencies.map((c, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-medium"
            >
              {c}
              <button
                type="button"
                onClick={() => removeCompetency(idx)}
                className="ml-1 hover:text-destructive transition-colors"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          ))}
          {competencies.length === 0 && (
            <p className="text-xs text-muted-foreground italic">No competencies — add one below.</p>
          )}
        </div>
        {competencies.length < 8 && (
          <div className="flex gap-2">
            <input
              className={cn(inputCn, "h-9 max-w-xs")}
              value={newCompetency}
              onChange={(e) => setNewCompetency(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCompetency(); } }}
              placeholder="e.g. Communication"
            />
            <Button type="button" variant="outline" size="sm" onClick={addCompetency}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add
            </Button>
          </div>
        )}
      </div>

      {/* Self-review Policy */}
      <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
        <div>
          <p className="text-sm font-medium">Require self-review before manager review</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            When on, managers cannot submit their review until the employee completes self-review.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSelfReviewRequired((v) => !v)}
          className="text-primary"
        >
          {selfReviewRequired
            ? <ToggleRight className="h-7 w-7" />
            : <ToggleLeft className="h-7 w-7 text-muted-foreground" />
          }
        </button>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={loading}>
          {loading ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
