"use client";

import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Plus, MoreHorizontal, PlayCircle, CheckCircle2, Trash2,
  ClipboardList, Users, ChevronRight, ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { updateCycleStatus, deleteReviewCycle } from "@/actions/reviews";
import { CreateCycleDialog } from "./create-cycle-dialog";
import { ReviewDialog } from "./review-dialog";
import type { ReviewCycleWithStats, ReviewWithDetails, MyReviewWithCycle } from "@/actions/reviews";
import type { Employee, UserRole } from "@/types";
import { hasPermission } from "@/types";
import type { PerformanceSettings } from "@/lib/performance-settings";

const STATUS_STYLES = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
};

const REVIEW_STATUS_STYLES = {
  pending: "bg-muted text-muted-foreground",
  self_review: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  manager_review: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
};

const REVIEW_STATUS_LABELS = {
  pending: "Pending",
  self_review: "Awaiting Self Review",
  manager_review: "Awaiting Manager Review",
  completed: "Completed",
};

interface ReviewsClientProps {
  cycles: ReviewCycleWithStats[];
  employees: Employee[];
  cycleReviews: ReviewWithDetails[];
  activeCycleId: string | null;
  role: UserRole;
  employeeId: string | null;
  myReviews: MyReviewWithCycle[];
  performanceSettings: PerformanceSettings;
}

function getUrgencyBadge(cycle: ReviewCycleWithStats): { label: string; style: string } | null {
  if (cycle.status !== "active") return null;
  const now = new Date();
  const end = new Date(cycle.end_date);
  const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (end < now && cycle.completed_reviews < cycle.total_reviews) {
    return { label: "Overdue", style: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" };
  }
  if (daysLeft <= 7 && daysLeft >= 0) {
    return { label: "Closing soon", style: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" };
  }
  return null;
}

export function ReviewsClient({ cycles, employees, cycleReviews, activeCycleId: initialCycleId, role, employeeId, myReviews, performanceSettings }: ReviewsClientProps) {
  const canManageCycles = hasPermission(role, "admin");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [activeCycleId, setActiveCycleId] = React.useState<string | null>(initialCycleId);
  const [reviewDialog, setReviewDialog] = React.useState<{
    review: ReviewWithDetails;
    mode: "self" | "manager" | "view";
    rating_scale?: 3 | 5 | 10;
  } | null>(null);

  const activeCycle = cycles.find((c) => c.id === activeCycleId) ?? null;

  const isEmployee = role === "employee";
  const [activeTab, setActiveTab] = React.useState<"cycles" | "my-reviews">(
    isEmployee ? "my-reviews" : "cycles"
  );

  async function handleStatusChange(cycleId: string, status: "draft" | "active" | "completed") {
    const result = await updateCycleStatus(cycleId, status);
    if (result.success) {
      toast.success(`Cycle marked as ${status}`);
    } else {
      toast.error(result.error);
    }
  }

  async function handleDelete(cycleId: string, name: string) {
    if (!confirm(`Delete "${name}"? All reviews in this cycle will be deleted.`)) return;
    const result = await deleteReviewCycle(cycleId);
    if (result.success) {
      toast.success("Cycle deleted");
      if (activeCycleId === cycleId) setActiveCycleId(null);
    } else {
      toast.error(result.error);
    }
  }

  // Cycle list view
  if (!activeCycleId || !activeCycle) {
    return (
      <>
        {isEmployee && (
          <div className="flex gap-1 border-b border-border mb-4">
            <button
              onClick={() => setActiveTab("my-reviews")}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                activeTab === "my-reviews"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              My Reviews
            </button>
            <button
              onClick={() => setActiveTab("cycles")}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                activeTab === "cycles"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              Cycles
            </button>
          </div>
        )}

        {activeTab === "my-reviews" && isEmployee && (
          <div className="space-y-3">
            {myReviews.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
                <ClipboardList className="h-10 w-10 text-muted-foreground/40" />
                <p className="font-medium text-sm">No reviews yet</p>
                <p className="text-sm text-muted-foreground">Your review history will appear here.</p>
              </div>
            ) : (
              myReviews.map((r) => (
                <div key={r.id} className="rounded-xl border border-border bg-card px-4 py-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-sm">{r.cycle_name}</p>
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", REVIEW_STATUS_STYLES[r.status])}>
                      {REVIEW_STATUS_LABELS[r.status]}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(r.cycle_start_date)} – {formatDate(r.cycle_end_date)}
                  </p>
                  {r.status !== "pending" && (
                    <button
                      className="mt-1 text-xs text-primary hover:underline"
                      onClick={() => setReviewDialog({ review: r, mode: r.status === "self_review" ? "self" : "view", rating_scale: (r as any).cycle_rating_scale ?? 5 })}
                    >
                      {r.status === "self_review" ? "Complete self-review" : "View"}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {(activeTab === "cycles" || !isEmployee) && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Performance Reviews</h1>
                <p className="mt-1 text-muted-foreground">Run review cycles and track team performance.</p>
              </div>
              {canManageCycles && (
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  New Cycle
                </Button>
              )}
            </div>

            {cycles.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
                <ClipboardList className="h-10 w-10 text-muted-foreground/40" />
                <div>
                  <p className="font-medium text-sm">No review cycles yet</p>
                  <p className="text-sm text-muted-foreground mt-0.5">Create a cycle to start collecting performance reviews.</p>
                </div>
                {canManageCycles && (
                  <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    New Cycle
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {cycles.map((cycle) => (
                  <div
                    key={cycle.id}
                    className="rounded-xl border border-border bg-card p-5 hover:border-primary/30 transition-colors cursor-pointer"
                    onClick={() => setActiveCycleId(cycle.id)}
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{cycle.name}</p>
                        {cycle.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{cycle.description}</p>
                        )}
                      </div>
                      {canManageCycles && <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.Content className="z-50 min-w-[160px] rounded-lg border bg-popover p-1 shadow-md" onClick={(e) => e.stopPropagation()}>
                            {cycle.status === "draft" && (
                              <DropdownMenu.Item
                                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-accent outline-none"
                                onClick={() => handleStatusChange(cycle.id, "active")}
                              >
                                <PlayCircle className="h-4 w-4 text-blue-500" />
                                Activate
                              </DropdownMenu.Item>
                            )}
                            {cycle.status === "active" && (
                              <DropdownMenu.Item
                                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-accent outline-none"
                                onClick={() => handleStatusChange(cycle.id, "completed")}
                              >
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                                Mark Completed
                              </DropdownMenu.Item>
                            )}
                            <DropdownMenu.Item
                              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-accent outline-none text-destructive"
                              onClick={() => handleDelete(cycle.id, cycle.name)}
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </DropdownMenu.Item>
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Root>}
                    </div>

                    <div className="flex items-center gap-2 mb-4 flex-wrap">
                      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize", STATUS_STYLES[cycle.status])}>
                        {cycle.status}
                      </span>
                      {(() => {
                        const urgency = getUrgencyBadge(cycle);
                        return urgency ? (
                          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0", urgency.style)}>
                            {urgency.label}
                          </span>
                        ) : null;
                      })()}
                    </div>

                    <div className="space-y-2 text-xs text-muted-foreground">
                      <div className="flex justify-between">
                        <span>{formatDate(cycle.start_date)} → {formatDate(cycle.end_date)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5" />
                        <span>{cycle.total_reviews} reviews</span>
                        {cycle.total_reviews > 0 && (
                          <span className="text-green-600 dark:text-green-400">
                            · {cycle.completed_reviews} completed
                          </span>
                        )}
                      </div>
                      {cycle.total_reviews > 0 && (
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${Math.round((cycle.completed_reviews / cycle.total_reviews) * 100)}%` }}
                          />
                        </div>
                      )}
                    </div>

                    <div className="mt-3 flex items-center justify-end text-xs text-primary font-medium">
                      View reviews <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {canManageCycles && <CreateCycleDialog open={createOpen} onOpenChange={setCreateOpen} employees={employees} />}
          </>
        )}
      </>
    );
  }

  // Cycle detail / reviews list view
  return (
    <>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setActiveCycleId(null)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight truncate">{activeCycle.name}</h1>
            <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", STATUS_STYLES[activeCycle.status])}>
              {activeCycle.status}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {formatDate(activeCycle.start_date)} → {formatDate(activeCycle.end_date)}
            {" · "}{activeCycle.completed_reviews}/{activeCycle.total_reviews} completed
          </p>
        </div>
        {activeCycle.status === "draft" && (
          <Button size="sm" onClick={() => handleStatusChange(activeCycle.id, "active")}>
            <PlayCircle className="mr-2 h-4 w-4" />
            Activate
          </Button>
        )}
        {activeCycle.status === "active" && (
          <Button size="sm" variant="outline" onClick={() => handleStatusChange(activeCycle.id, "completed")}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Close Cycle
          </Button>
        )}
      </div>

      {cycleReviews.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
          <ClipboardList className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No reviews in this cycle.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="divide-y divide-border">
            {cycleReviews.map((review) => (
              <div key={review.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{review.employee_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Reviewer: {review.reviewer_name || "—"}</p>
                </div>

                <div className="flex items-center gap-3">
                  {review.self_rating && (
                    <span className="text-xs text-muted-foreground">Self: {review.self_rating}/5</span>
                  )}
                  {review.manager_rating && (
                    <span className="text-xs text-muted-foreground">Manager: {review.manager_rating}/5</span>
                  )}
                  <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", REVIEW_STATUS_STYLES[review.status])}>
                    {REVIEW_STATUS_LABELS[review.status]}
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {review.status === "pending" && activeCycle.status === "active" && (
                    <Button size="sm" variant="outline" onClick={() => setReviewDialog({ review, mode: "self" })}>
                      Self Review
                    </Button>
                  )}
                  {review.status === "manager_review" && activeCycle.status === "active" && (
                    <Button size="sm" variant="outline" onClick={() => setReviewDialog({ review, mode: "manager" })}>
                      Manager Review
                    </Button>
                  )}
                  {review.status === "completed" && (
                    <Button size="sm" variant="ghost" onClick={() => setReviewDialog({ review, mode: "view" })}>
                      View
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {reviewDialog && (
        <ReviewDialog
          open
          onOpenChange={(open) => { if (!open) setReviewDialog(null); }}
          review={reviewDialog.review}
          mode={reviewDialog.mode}
          performanceSettings={performanceSettings}
          rating_scale={reviewDialog.rating_scale ?? activeCycle?.rating_scale ?? 5}
        />
      )}
    </>
  );
}
