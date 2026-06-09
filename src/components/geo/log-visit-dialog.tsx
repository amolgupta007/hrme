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
        toast.error(res.error ?? "Something went wrong");
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
          {/* Outcome */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Outcome</Label>
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as LeadOutcome)}
              disabled={pending}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {LEAD_OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {outcomeLabel(o)}
                </option>
              ))}
            </select>
            {isTerminal && (
              <p className="text-xs text-amber-600 mt-1">
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
