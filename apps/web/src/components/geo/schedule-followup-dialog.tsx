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
import { createLeadVisit } from "@/actions/geo-visits";

interface ScheduleFollowupDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leadId: string;
  leadName: string;
  /** Default date to seed when the dialog opens. ISO-date (YYYY-MM-DD). */
  initialDate?: string;
}

/**
 * Lightweight "Schedule one" path that creates an outcome=follow_up visit
 * row carrying just the target date + an optional note. Operators reach
 * for this when they want to tickle a lead on a future date without
 * having to fabricate a "what happened" log entry, which is what the
 * full LogVisitDialog asks for. The visit shows up in the timeline like
 * any other so the audit trail stays honest.
 */
export function ScheduleFollowupDialog({
  open,
  onOpenChange,
  leadId,
  leadName,
  initialDate,
}: ScheduleFollowupDialogProps) {
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState(initialDate ?? "");
  const [notes, setNotes] = useState("");

  // Reset the form whenever the dialog opens so a prior cancel doesn't
  // bleed values into the next session.
  useEffect(() => {
    if (!open) return;
    setDate(initialDate ?? "");
    setNotes("");
  }, [open, initialDate]);

  function save() {
    if (!date) {
      toast.error("Pick a follow-up date.");
      return;
    }
    startTransition(async () => {
      const res = await createLeadVisit({
        lead_id: leadId,
        outcome: "follow_up",
        notes: notes.trim() || "Follow-up scheduled",
        follow_up_date: date,
      });
      if (res.success) {
        toast.success(
          `Follow-up scheduled for “${leadName}” on ${formatPretty(date)}.`,
        );
        onOpenChange(false);
      } else {
        toast.error(
          res.error ??
            "Couldn't schedule the follow-up. Check your connection and try again.",
        );
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Schedule a follow-up</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 py-1">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Follow-up date
            </Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={pending}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Note (optional)
            </Label>
            <Textarea
              rows={3}
              placeholder="What's this follow-up about?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={pending}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatPretty(iso: string): string {
  // Parse as local-date to avoid the off-by-one when the ISO is treated
  // as UTC and rendered in a positive-offset locale.
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
