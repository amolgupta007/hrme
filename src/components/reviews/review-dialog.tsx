"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Label from "@radix-ui/react-label";
import { X, Star, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { submitSelfReview, submitManagerReview } from "@/actions/reviews";
import type { ReviewWithDetails } from "@/actions/reviews";

type Goal = { title: string; status: "pending" | "achieved" | "missed" };

const GOAL_STATUS_COLORS = {
  pending: "bg-muted text-muted-foreground",
  achieved: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  missed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

function StarRating({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  const [hovered, setHovered] = React.useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange?.(star)}
          onMouseEnter={() => onChange && setHovered(star)}
          onMouseLeave={() => onChange && setHovered(0)}
          disabled={!onChange}
          className={cn("transition-colors", onChange ? "cursor-pointer" : "cursor-default")}
        >
          <Star
            className={cn(
              "h-6 w-6",
              (hovered || value) >= star
                ? "fill-amber-400 text-amber-400"
                : "fill-none text-muted-foreground/40"
            )}
          />
        </button>
      ))}
      {value > 0 && (
        <span className="ml-2 text-sm font-medium text-muted-foreground self-center">
          {["", "Poor", "Fair", "Good", "Great", "Excellent"][value]}
        </span>
      )}
    </div>
  );
}

const inputCn =
  "flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";

interface ReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  review: ReviewWithDetails;
  mode: "self" | "manager" | "view";
}

export function ReviewDialog({ open, onOpenChange, review, mode }: ReviewDialogProps) {
  const [rating, setRating] = React.useState(
    mode === "self" ? (review.self_rating ?? 0) : (review.manager_rating ?? 0)
  );
  const [comments, setComments] = React.useState(
    mode === "self" ? (review.self_comments ?? "") : (review.manager_comments ?? "")
  );
  const [goals, setGoals] = React.useState<Goal[]>(review.goals ?? []);
  const [newGoal, setNewGoal] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const result = mode === "self"
      ? await submitSelfReview(review.id, { self_rating: rating, self_comments: comments, goals })
      : await submitManagerReview(review.id, { manager_rating: rating, manager_comments: comments });

    setLoading(false);
    if (result.success) {
      toast.success(mode === "self" ? "Self review submitted" : "Manager review submitted");
      onOpenChange(false);
    } else {
      toast.error(result.error);
    }
  }

  function addGoal() {
    if (!newGoal.trim()) return;
    setGoals((prev) => [...prev, { title: newGoal.trim(), status: "pending" }]);
    setNewGoal("");
  }

  function updateGoalStatus(idx: number, status: Goal["status"]) {
    setGoals((prev) => prev.map((g, i) => i === idx ? { ...g, status } : g));
  }

  function removeGoal(idx: number) {
    setGoals((prev) => prev.filter((_, i) => i !== idx));
  }

  const isReadOnly = mode === "view";
  const title = mode === "self" ? "Self Assessment" : mode === "manager" ? "Manager Review" : "Review Details";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl bg-background p-6 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-5">
            <div>
              <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
              <p className="text-sm text-muted-foreground mt-0.5">{review.employee_name}</p>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon"><X className="h-4 w-4" /></Button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Rating */}
            <div className="space-y-2">
              <Label.Root className="text-sm font-medium">
                {mode === "self" ? "Self Rating" : "Manager Rating"}
                {!isReadOnly && <span className="text-destructive ml-0.5">*</span>}
              </Label.Root>
              <StarRating value={rating} onChange={isReadOnly ? undefined : setRating} />
            </div>

            {/* View mode: show both ratings */}
            {mode === "view" && (
              <div className="grid grid-cols-2 gap-4 rounded-lg border border-border p-4 bg-muted/30">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Self Rating</p>
                  <StarRating value={review.self_rating ?? 0} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Manager Rating</p>
                  <StarRating value={review.manager_rating ?? 0} />
                </div>
              </div>
            )}

            {/* Comments */}
            <div className="space-y-1.5">
              <Label.Root className="text-sm font-medium">
                Comments
                {!isReadOnly && <span className="text-destructive ml-0.5">*</span>}
              </Label.Root>
              <textarea
                className={cn(inputCn, "min-h-[100px] resize-none")}
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder={mode === "self" ? "Describe your achievements, challenges, and growth..." : "Share your assessment of this employee's performance..."}
                disabled={isReadOnly}
                required={!isReadOnly}
              />
            </div>

            {/* Manager comments in view mode */}
            {mode === "view" && review.manager_comments && (
              <div className="space-y-1.5">
                <Label.Root className="text-sm font-medium">Manager Comments</Label.Root>
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                  {review.manager_comments}
                </div>
              </div>
            )}

            {/* Goals (self review only) */}
            {(mode === "self" || (mode === "view" && goals.length > 0)) && (
              <div className="space-y-2">
                <Label.Root className="text-sm font-medium">Goals</Label.Root>

                {goals.length > 0 && (
                  <div className="space-y-2">
                    {goals.map((goal, idx) => (
                      <div key={idx} className="flex items-center gap-2 rounded-lg border border-border p-2.5">
                        <p className="flex-1 text-sm">{goal.title}</p>
                        {!isReadOnly ? (
                          <div className="flex items-center gap-1">
                            {(["pending", "achieved", "missed"] as const).map((s) => (
                              <button
                                key={s}
                                type="button"
                                onClick={() => updateGoalStatus(idx, s)}
                                className={cn(
                                  "rounded-full px-2 py-0.5 text-xs font-medium capitalize transition-colors",
                                  goal.status === s ? GOAL_STATUS_COLORS[s] : "bg-muted text-muted-foreground hover:bg-muted/80"
                                )}
                              >
                                {s}
                              </button>
                            ))}
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeGoal(idx)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium capitalize", GOAL_STATUS_COLORS[goal.status])}>
                            {goal.status}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {!isReadOnly && (
                  <div className="flex gap-2">
                    <input
                      className={cn(inputCn, "h-9 flex-1")}
                      value={newGoal}
                      onChange={(e) => setNewGoal(e.target.value)}
                      placeholder="Add a goal..."
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addGoal(); } }}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={addGoal}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}

            {!isReadOnly && (
              <div className="flex justify-end gap-3 pt-1">
                <Dialog.Close asChild>
                  <Button type="button" variant="outline">Cancel</Button>
                </Dialog.Close>
                <Button type="submit" disabled={loading || rating === 0}>
                  {loading ? "Submitting..." : "Submit Review"}
                </Button>
              </div>
            )}
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
