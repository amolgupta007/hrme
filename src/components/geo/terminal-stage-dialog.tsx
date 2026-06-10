"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createLeadVisit } from "@/actions/geo-visits";

interface TerminalStageDialogProps {
  open: boolean;
  /** Called with `false` to close. The parent stepper rolls back the
   *  optimistic stage change when this fires without a successful save. */
  onOpenChange: (open: boolean, savedSuccessfully?: boolean) => void;
  leadId: string;
  leadName: string;
  targetStage: "converted" | "lost";
  /** Current estimated value, surfaced as the default for the "final value"
   *  input on the converted path. */
  currentValueInr: number | null;
}

const LOST_REASONS = [
  "Price",
  "Competitor",
  "Timing",
  "Not a fit",
  "No response",
  "Other",
] as const;
type LostReason = (typeof LOST_REASONS)[number];

/**
 * Intercept dialog for the stage stepper's two terminal targets. Both
 * "converted" and "lost" end the lead's funnel life, so the operator
 * captures closing context (final value / loss reason / notes) before the
 * stage flips. Submit creates a single audit visit row carrying the
 * captured info; the server's existing outcome→stage mapping flips the
 * lead's stage as a side effect, so we avoid a separate updateLeadStage
 * round-trip.
 */
export function TerminalStageDialog({
  open,
  onOpenChange,
  leadId,
  leadName,
  targetStage,
  currentValueInr,
}: TerminalStageDialogProps) {
  const [pending, startTransition] = useTransition();
  const [finalValue, setFinalValue] = useState("");
  const [reason, setReason] = useState<LostReason | "">("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setFinalValue(currentValueInr?.toString() ?? "");
    setReason("");
    setNotes("");
  }, [open, currentValueInr]);

  function handleCancel() {
    onOpenChange(false, false);
  }

  function save() {
    if (targetStage === "lost" && !reason) {
      toast.error("Pick a reason so the loss is captured in the audit trail.");
      return;
    }

    // Compose a structured note that survives in the visit timeline. Keeps
    // the lost-reason picklist value out of a schema column (Phase 1 has
    // no `lost_reason` field) while staying greppable.
    const composedNotes = (() => {
      const trimmed = notes.trim();
      if (targetStage === "converted") {
        const parts: string[] = ["Marked as Converted"];
        if (finalValue && Number(finalValue) !== currentValueInr) {
          parts.push(
            `Final value: ₹${Number(finalValue).toLocaleString("en-IN")}`,
          );
        }
        if (trimmed) parts.push(trimmed);
        return parts.join(" — ");
      }
      // lost
      const parts: string[] = [`Lost — ${reason}`];
      if (trimmed) parts.push(trimmed);
      return parts.join(": ");
    })();

    startTransition(async () => {
      const res = await createLeadVisit({
        lead_id: leadId,
        outcome: targetStage,
        notes: composedNotes,
        follow_up_date: null,
      });
      if (res.success) {
        toast.success(
          targetStage === "converted"
            ? `Marked “${leadName}” as Converted. Nice close.`
            : `Marked “${leadName}” as Lost.`,
        );
        onOpenChange(false, true);
      } else {
        toast.error(
          res.error ??
            `Couldn't mark as ${targetStage}. Check your connection and try again.`,
        );
      }
    });
  }

  const isConverted = targetStage === "converted";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        // Closing via X or backdrop is a cancel (rollback).
        if (!v) handleCancel();
        else onOpenChange(true);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isConverted ? "Mark as Converted" : "Mark as Lost"}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          {isConverted
            ? "Capture the closing context so future reports keep the why."
            : "Tell us why so the funnel learns from this one."}
        </p>

        <div className="grid gap-3 py-1">
          {isConverted ? (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Final value (₹)
              </Label>
              <Input
                type="number"
                min={0}
                value={finalValue}
                onChange={(e) => setFinalValue(e.target.value)}
                placeholder="0"
                disabled={pending}
              />
            </div>
          ) : (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Reason *
              </Label>
              <Select
                value={reason}
                onValueChange={(v) => setReason(v as LostReason)}
                disabled={pending}
              >
                <SelectTrigger aria-label="Reason for loss">
                  <SelectValue placeholder="Pick a reason" />
                </SelectTrigger>
                <SelectContent>
                  {LOST_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {isConverted ? "Closing notes (optional)" : "Notes (optional)"}
            </Label>
            <Textarea
              rows={3}
              placeholder={
                isConverted
                  ? "How did this close? Anything to capture for the next one?"
                  : "Anything more specific about what happened?"
              }
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={pending}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleCancel} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            {isConverted ? "Mark as Converted" : "Mark as Lost"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
