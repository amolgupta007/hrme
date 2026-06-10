"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LEAD_OUTCOMES, outcomeLabel, type LeadOutcome } from "@/lib/geo/stages";
import { createLeadVisit } from "@/actions/geo-visits";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leadId: string;
}

const TERMINAL_OUTCOMES: LeadOutcome[] = ["converted", "lost"];

export function LogVisitDialog({ open, onOpenChange, leadId }: Props) {
  const [pending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<LeadOutcome>("in_progress");
  const [notes, setNotes] = useState("");
  const [followUp, setFollowUp] = useState("");

  function reset() {
    setOutcome("in_progress");
    setNotes("");
    setFollowUp("");
  }

  function handleClose(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  function save() {
    startTransition(async () => {
      const res = await createLeadVisit({
        lead_id: leadId,
        outcome,
        notes: notes.trim() || null,
        follow_up_date: followUp || null,
      });
      if (res.success) {
        toast.success("Visit logged");
        reset();
        onOpenChange(false);
      } else {
        // Same actionable vocabulary as the kanban + stepper paths:
        // tell the operator their input is still in the form so they
        // don't lose work to a connection blip.
        toast.error(
          res.error ??
            "Couldn't save visit — your changes are still in the form. Check your connection and try again.",
        );
      }
    });
  }

  const isTerminal = TERMINAL_OUTCOMES.includes(outcome);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Log a visit</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          {/* Outcome — shadcn Select for consistency with the rest of the
              JambaGeo dialogs (LeadDialog stage/assignee/source picker). */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Outcome</Label>
            <Select
              value={outcome}
              onValueChange={(v) => setOutcome(v as LeadOutcome)}
              disabled={pending}
            >
              <SelectTrigger aria-label="Visit outcome">
                <SelectValue placeholder="Select outcome" />
              </SelectTrigger>
              <SelectContent>
                {LEAD_OUTCOMES.map((o) => (
                  <SelectItem key={o} value={o}>
                    {outcomeLabel(o)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isTerminal && (
              <p className="text-xs text-amber-700 mt-1">
                Saving this visit will move the lead to the &quot;
                {outcome === "converted" ? "Converted" : "Lost"}&quot; stage.
              </p>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What was discussed?"
              disabled={pending}
            />
          </div>

          {/* Follow-up date */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Follow-up date (optional)
            </Label>
            <Input
              type="date"
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              disabled={pending}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => handleClose(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            Save visit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
