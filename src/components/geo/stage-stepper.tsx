"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LEAD_STAGES,
  stageLabel,
  type LeadStage,
} from "@/lib/geo/stages";
import { updateLeadStage } from "@/actions/geo-leads";

interface StageStepperProps {
  leadId: string;
  current: LeadStage;
  leadName: string;
  disabled?: boolean;
}

/**
 * Inline stage flip. Replaces "go back to kanban and drag" or "open Edit
 * dialog and pick stage" with a one-click change directly on the detail
 * card. Optimistic with a snap-back-on-failure toast that names the lead
 * and the prior stage — same vocabulary as the kanban error path so the
 * operator learns one mental model.
 */
export function StageStepper({
  leadId,
  current,
  leadName,
  disabled,
}: StageStepperProps) {
  const [stage, setStage] = useState<LeadStage>(current);
  const [pending, startTransition] = useTransition();

  function onChange(next: string) {
    const nextStage = next as LeadStage;
    if (nextStage === stage) return;

    const prev = stage;
    setStage(nextStage);

    startTransition(async () => {
      const res = await updateLeadStage(leadId, { stage: nextStage });
      if (!res.success) {
        setStage(prev);
        toast.error(
          res.error ??
            `Stage change failed — “${leadName}” stayed at ${stageLabel(
              prev,
            )}. Check your connection and try again.`,
        );
      } else {
        toast.success(
          `Moved “${leadName}” to ${stageLabel(nextStage)}.`,
        );
      }
    });
  }

  return (
    <Select
      value={stage}
      onValueChange={onChange}
      disabled={disabled || pending}
    >
      <SelectTrigger
        className="w-full max-w-[260px]"
        aria-label="Lead stage"
      >
        <SelectValue placeholder="Select stage" />
      </SelectTrigger>
      <SelectContent>
        {LEAD_STAGES.map((s) => (
          <SelectItem key={s} value={s}>
            {stageLabel(s)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
