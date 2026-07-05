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
import { TerminalStageDialog } from "./terminal-stage-dialog";

interface StageStepperProps {
  leadId: string;
  current: LeadStage;
  leadName: string;
  /** Current value used to pre-fill the "Final value" field on the
   *  terminal-stage dialog's converted path. */
  currentValueInr: number | null;
  disabled?: boolean;
}

const TERMINAL_STAGES: ReadonlyArray<LeadStage> = ["converted", "lost"];

/**
 * Inline stage flip. Replaces "go back to kanban and drag" or "open Edit
 * dialog and pick stage" with a one-click change directly on the detail
 * card. Optimistic with a snap-back-on-failure toast that names the lead
 * and the prior stage — same vocabulary as the kanban error path so the
 * operator learns one mental model.
 *
 * Terminal stages (converted, lost) intercept with a capture dialog
 * before the flip. The dialog creates a visit row whose outcome auto-
 * advances the lead's stage server-side, so we avoid a separate
 * updateLeadStage round-trip on the terminal paths.
 */
export function StageStepper({
  leadId,
  current,
  leadName,
  currentValueInr,
  disabled,
}: StageStepperProps) {
  const [stage, setStage] = useState<LeadStage>(current);
  const [pending, startTransition] = useTransition();
  const [terminalTarget, setTerminalTarget] = useState<"converted" | "lost" | null>(
    null,
  );
  /** Stage to roll back to if the terminal dialog is cancelled. */
  const [terminalRollback, setTerminalRollback] = useState<LeadStage | null>(null);

  function onChange(next: string) {
    const nextStage = next as LeadStage;
    if (nextStage === stage) return;

    const prev = stage;

    // Terminal targets: snap the Select to the new value optimistically so
    // the UI reflects the operator's intent, but open the capture dialog
    // before the server call. Cancelling rolls back.
    if (TERMINAL_STAGES.includes(nextStage)) {
      setStage(nextStage);
      setTerminalRollback(prev);
      setTerminalTarget(nextStage as "converted" | "lost");
      return;
    }

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
        toast.success(`Moved “${leadName}” to ${stageLabel(nextStage)}.`);
      }
    });
  }

  function onTerminalDialogChange(open: boolean, savedSuccessfully?: boolean) {
    if (open) return;
    // Closing without a successful save = cancel; rollback the stepper.
    if (!savedSuccessfully && terminalRollback) {
      setStage(terminalRollback);
    }
    setTerminalTarget(null);
    setTerminalRollback(null);
  }

  return (
    <>
      <Select
        value={stage}
        onValueChange={onChange}
        disabled={disabled || pending || terminalTarget !== null}
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

      {terminalTarget && (
        <TerminalStageDialog
          open
          onOpenChange={onTerminalDialogChange}
          leadId={leadId}
          leadName={leadName}
          targetStage={terminalTarget}
          currentValueInr={currentValueInr}
        />
      )}
    </>
  );
}
