"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Label from "@radix-ui/react-label";
import { X, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { approveObjectives, rejectObjectives } from "@/actions/objectives";
import type { ObjectiveSet } from "@/actions/objectives";

const WEIGHT_COLOR = "bg-primary/10 text-primary";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  objective: ObjectiveSet;
}

export function ApproveDialog({ open, onOpenChange, objective }: Props) {
  const [feedback, setFeedback] = React.useState(objective.manager_feedback ?? "");
  const [loading, setLoading] = React.useState<"approve" | "reject" | null>(null);

  React.useEffect(() => {
    if (open) setFeedback(objective.manager_feedback ?? "");
  }, [open, objective]);

  async function handleApprove() {
    setLoading("approve");
    const result = await approveObjectives(objective.id, feedback || undefined);
    setLoading(null);
    if (result.success) {
      toast.success("Objectives approved");
      onOpenChange(false);
    } else {
      toast.error(result.error);
    }
  }

  async function handleReject() {
    if (!feedback.trim()) { toast.error("Please provide feedback explaining the rejection"); return; }
    setLoading("reject");
    const result = await rejectObjectives(objective.id, feedback);
    setLoading(null);
    if (result.success) {
      toast.success("Objectives returned for revision");
      onOpenChange(false);
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl bg-background p-6 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-1">
            <Dialog.Title className="text-lg font-semibold">Review Objectives</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon"><X className="h-4 w-4" /></Button>
            </Dialog.Close>
          </div>
          <p className="text-sm text-muted-foreground mb-5">
            {objective.employee_name} · {objective.period_label}
          </p>

          {/* Objectives list */}
          <div className="space-y-3 mb-5">
            {objective.items.map((item, idx) => (
              <div key={item.id} className="rounded-lg border border-border p-3.5 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-sm">{item.title}</p>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium shrink-0", WEIGHT_COLOR)}>
                    {item.weight}%
                  </span>
                </div>
                {item.description && (
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                )}
                {item.success_criteria && (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">Success: </span>{item.success_criteria}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Feedback */}
          <div className="space-y-1.5 mb-5">
            <Label.Root className="text-sm font-medium">
              Feedback
              <span className="ml-1 text-muted-foreground font-normal text-xs">(required for rejection)</span>
            </Label.Root>
            <textarea
              className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 min-h-[80px] resize-none"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Add comments or suggestions for the employee..."
            />
          </div>

          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={handleReject}
              disabled={!!loading}
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              {loading === "reject" ? "Rejecting..." : (
                <><XCircle className="mr-2 h-4 w-4" />Return for Revision</>
              )}
            </Button>
            <Button onClick={handleApprove} disabled={!!loading}>
              {loading === "approve" ? "Approving..." : (
                <><CheckCircle2 className="mr-2 h-4 w-4" />Approve</>
              )}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
