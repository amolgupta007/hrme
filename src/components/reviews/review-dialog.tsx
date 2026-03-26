"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Label from "@radix-ui/react-label";
import { X, Star, Plus, Trash2, Target } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { submitSelfReview, submitManagerReview } from "@/actions/reviews";
import { updateObjectiveItems } from "@/actions/objectives";
import type { ReviewWithDetails } from "@/actions/reviews";
import type { ObjectiveItem } from "@/actions/objectives";

type Goal = { title: string; status: "pending" | "achieved" | "missed" };

const GOAL_STATUS_COLORS = {
  pending: "bg-muted text-muted-foreground",
  achieved: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  missed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

const SELF_STATUS_OPTIONS: { value: ObjectiveItem["self_status"]; label: string; color: string }[] = [
  { value: "on_track", label: "On Track", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  { value: "achieved", label: "Achieved", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  { value: "partially_achieved", label: "Partial", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  { value: "missed", label: "Missed", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
];

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

  // Objective evaluations: objectiveId -> items array
  const [objEvals, setObjEvals] = React.useState<Record<string, ObjectiveItem[]>>(() => {
    const map: Record<string, ObjectiveItem[]> = {};
    for (const obj of review.objectives ?? []) {
      map[obj.id] = obj.items.map((item) => ({ ...item }));
    }
    return map;
  });

  function updateObjItem(objId: string, itemId: string, patch: Partial<ObjectiveItem>) {
    setObjEvals((prev) => ({
      ...prev,
      [objId]: (prev[objId] ?? []).map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    // Save objective evaluations first (parallel)
    const objUpdates = Object.entries(objEvals).map(([objId, items]) =>
      updateObjectiveItems(objId, items)
    );

    const reviewAction =
      mode === "self"
        ? submitSelfReview(review.id, { self_rating: rating, self_comments: comments, goals })
        : submitManagerReview(review.id, { manager_rating: rating, manager_comments: comments });

    const [reviewResult] = await Promise.all([reviewAction, ...objUpdates]);

    setLoading(false);
    if (reviewResult.success) {
      toast.success(mode === "self" ? "Self review submitted" : "Manager review submitted");
      onOpenChange(false);
    } else {
      toast.error(reviewResult.error);
    }
  }

  function addGoal() {
    if (!newGoal.trim()) return;
    setGoals((prev) => [...prev, { title: newGoal.trim(), status: "pending" }]);
    setNewGoal("");
  }

  function updateGoalStatus(idx: number, status: Goal["status"]) {
    setGoals((prev) => prev.map((g, i) => (i === idx ? { ...g, status } : g)));
  }

  function removeGoal(idx: number) {
    setGoals((prev) => prev.filter((_, i) => i !== idx));
  }

  const isReadOnly = mode === "view";
  const title = mode === "self" ? "Self Assessment" : mode === "manager" ? "Manager Review" : "Review Details";
  const hasObjectives = (review.objectives ?? []).length > 0;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-xl bg-background p-6 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-5">
            <div>
              <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
              <p className="text-sm text-muted-foreground mt-0.5">{review.employee_name}</p>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon"><X className="h-4 w-4" /></Button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Overall Rating */}
            <div className="space-y-2">
              <Label.Root className="text-sm font-medium">
                {mode === "self" ? "Overall Self Rating" : "Overall Manager Rating"}
                {!isReadOnly && <span className="text-destructive ml-0.5">*</span>}
              </Label.Root>
              <StarRating value={rating} onChange={isReadOnly ? undefined : setRating} />
            </div>

            {/* View mode: both ratings */}
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
                {mode === "view" ? "Self Comments" : "Comments"}
                {!isReadOnly && <span className="text-destructive ml-0.5">*</span>}
              </Label.Root>
              <textarea
                className={cn(inputCn, "min-h-[90px] resize-none")}
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder={
                  mode === "self"
                    ? "Describe your achievements, challenges, and growth..."
                    : "Share your assessment of this employee's performance..."
                }
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

            {/* ---- Objectives section ---- */}
            {hasObjectives && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  <Label.Root className="text-sm font-medium">
                    {mode === "self" ? "Evaluate Your Objectives" :
                     mode === "manager" ? "Objective Evaluations" :
                     "Objectives"}
                  </Label.Root>
                </div>

                {(review.objectives ?? []).map((obj) => {
                  const items = objEvals[obj.id] ?? obj.items;
                  return (
                    <div key={obj.id} className="rounded-lg border border-border overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b border-border">
                        <span className="text-xs font-semibold text-muted-foreground">{obj.period_label}</span>
                        <span className="text-xs text-muted-foreground capitalize">· {obj.period_type}</span>
                      </div>

                      <div className="divide-y divide-border">
                        {items.map((item) => (
                          <div key={item.id} className="p-3 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium">{item.title}</p>
                              <span className="text-xs rounded-full bg-primary/10 text-primary px-2 py-0.5 shrink-0">
                                {item.weight}%
                              </span>
                            </div>
                            {item.success_criteria && (
                              <p className="text-xs text-muted-foreground">
                                <span className="font-medium">Target: </span>{item.success_criteria}
                              </p>
                            )}

                            {/* Self-review: employee evaluates */}
                            {mode === "self" && (
                              <div className="space-y-2 pt-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {SELF_STATUS_OPTIONS.map((opt) => (
                                    <button
                                      key={opt.value}
                                      type="button"
                                      onClick={() => updateObjItem(obj.id, item.id, { self_status: opt.value })}
                                      className={cn(
                                        "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                                        item.self_status === opt.value
                                          ? opt.color
                                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                                      )}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                  <div className="flex items-center gap-1.5 ml-auto">
                                    <span className="text-xs text-muted-foreground">Progress:</span>
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      className="w-16 h-7 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                                      placeholder="0"
                                      value={item.self_progress ?? ""}
                                      onChange={(e) =>
                                        updateObjItem(obj.id, item.id, {
                                          self_progress: e.target.value ? Number(e.target.value) : null,
                                        })
                                      }
                                    />
                                    <span className="text-xs text-muted-foreground">%</span>
                                  </div>
                                </div>
                                <input
                                  className={cn(inputCn, "h-8 text-xs")}
                                  value={item.self_comment ?? ""}
                                  onChange={(e) =>
                                    updateObjItem(obj.id, item.id, { self_comment: e.target.value || null })
                                  }
                                  placeholder="Add a comment..."
                                />
                              </div>
                            )}

                            {/* Manager review: see self-eval + add manager rating */}
                            {mode === "manager" && (
                              <div className="space-y-2 pt-1">
                                {/* Employee's self-evaluation */}
                                {(item.self_status || item.self_progress !== null) && (
                                  <div className="rounded-md bg-muted/40 px-3 py-2 space-y-0.5">
                                    <p className="text-xs font-medium text-muted-foreground">Employee's Evaluation</p>
                                    <div className="flex items-center gap-2 flex-wrap text-xs">
                                      {item.self_status && (
                                        <span className={cn("rounded-full px-2 py-0.5 font-medium",
                                          SELF_STATUS_OPTIONS.find(o => o.value === item.self_status)?.color ?? "bg-muted text-muted-foreground"
                                        )}>
                                          {SELF_STATUS_OPTIONS.find(o => o.value === item.self_status)?.label}
                                        </span>
                                      )}
                                      {item.self_progress !== null && (
                                        <span className="text-muted-foreground">{item.self_progress}% progress</span>
                                      )}
                                      {item.self_comment && (
                                        <span className="text-muted-foreground italic">"{item.self_comment}"</span>
                                      )}
                                    </div>
                                  </div>
                                )}
                                {/* Manager rating */}
                                <div className="flex items-center gap-3">
                                  <span className="text-xs text-muted-foreground">Your rating:</span>
                                  <div className="flex gap-0.5">
                                    {[1, 2, 3, 4, 5].map((n) => (
                                      <button
                                        key={n}
                                        type="button"
                                        onClick={() => updateObjItem(obj.id, item.id, { manager_rating: n })}
                                        className="p-0.5"
                                      >
                                        <Star className={cn("h-5 w-5 transition-colors",
                                          (item.manager_rating ?? 0) >= n
                                            ? "fill-amber-400 text-amber-400"
                                            : "fill-none text-muted-foreground/40"
                                        )} />
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                <input
                                  className={cn(inputCn, "h-8 text-xs")}
                                  value={item.manager_comment ?? ""}
                                  onChange={(e) =>
                                    updateObjItem(obj.id, item.id, { manager_comment: e.target.value || null })
                                  }
                                  placeholder="Manager comment..."
                                />
                              </div>
                            )}

                            {/* View mode */}
                            {mode === "view" && (
                              <div className="space-y-1.5 pt-1 text-xs text-muted-foreground">
                                {item.self_status && (
                                  <div className="flex items-center gap-1.5">
                                    <span>Self:</span>
                                    <span className={cn("rounded-full px-2 py-0.5 font-medium",
                                      SELF_STATUS_OPTIONS.find(o => o.value === item.self_status)?.color ?? ""
                                    )}>
                                      {SELF_STATUS_OPTIONS.find(o => o.value === item.self_status)?.label}
                                    </span>
                                    {item.self_progress !== null && <span>{item.self_progress}%</span>}
                                  </div>
                                )}
                                {item.manager_rating !== null && (
                                  <div className="flex items-center gap-1.5">
                                    <span>Manager: {item.manager_rating}/5</span>
                                    {item.manager_comment && <span>· "{item.manager_comment}"</span>}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Ad-hoc Goals (self review only) */}
            {(mode === "self" || (mode === "view" && goals.length > 0)) && (
              <div className="space-y-2">
                <Label.Root className="text-sm font-medium">Additional Goals</Label.Root>
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
                                  goal.status === s
                                    ? GOAL_STATUS_COLORS[s]
                                    : "bg-muted text-muted-foreground hover:bg-muted/80"
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
                      placeholder="Add an ad-hoc goal..."
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
