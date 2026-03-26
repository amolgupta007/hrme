"use client";

import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Target, Plus, MoreHorizontal, Send, Trash2, CheckCircle2,
  XCircle, Clock, ChevronDown, ChevronRight, Edit2, RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { submitObjectives, deleteObjectiveSet } from "@/actions/objectives";
import { CreateObjectiveDialog } from "./create-objective-dialog";
import { ApproveDialog } from "./approve-dialog";
import type { ObjectiveSet } from "@/actions/objectives";

type Tab = "mine" | "approvals" | "all";

const STATUS_STYLES: Record<ObjectiveSet["status"], string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  approved: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

const STATUS_LABELS: Record<ObjectiveSet["status"], string> = {
  draft: "Draft",
  submitted: "Pending Approval",
  approved: "Approved",
  rejected: "Revision Needed",
};

const SELF_STATUS_STYLES: Record<string, string> = {
  on_track: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  achieved: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  partially_achieved: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  missed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

const SELF_STATUS_LABELS: Record<string, string> = {
  on_track: "On Track",
  achieved: "Achieved",
  partially_achieved: "Partial",
  missed: "Missed",
};

function ObjectiveCard({
  obj,
  tab,
  onApprove,
  onEdit,
}: {
  obj: ObjectiveSet;
  tab: Tab;
  onApprove: (obj: ObjectiveSet) => void;
  onEdit: (obj: ObjectiveSet) => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const totalWeight = obj.items.reduce((s, i) => s + i.weight, 0);

  async function handleSubmit() {
    const result = await submitObjectives(obj.id);
    if (result.success) toast.success("Submitted for approval");
    else toast.error(result.error);
  }

  async function handleDelete() {
    if (!confirm(`Delete objectives for ${obj.period_label}?`)) return;
    const result = await deleteObjectiveSet(obj.id);
    if (result.success) toast.success("Deleted");
    else toast.error(result.error);
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <button type="button" className="text-muted-foreground">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{obj.period_label}</span>
            <span className="text-xs text-muted-foreground capitalize">{obj.period_type}</span>
            {tab === "all" && (
              <span className="text-xs text-muted-foreground">· {obj.employee_name}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {obj.items.length} objective{obj.items.length !== 1 ? "s" : ""}
            {obj.manager_name && ` · Manager: ${obj.manager_name}`}
          </p>
        </div>
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0", STATUS_STYLES[obj.status])}>
          {STATUS_LABELS[obj.status]}
        </span>

        {/* Actions */}
        {tab !== "approvals" && (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="z-50 min-w-[160px] rounded-lg border bg-popover p-1 shadow-md"
                onClick={(e) => e.stopPropagation()}
              >
                {(obj.status === "draft" || obj.status === "rejected") && (
                  <>
                    <DropdownMenu.Item
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-accent outline-none"
                      onClick={() => onEdit(obj)}
                    >
                      <Edit2 className="h-4 w-4" /> Edit
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-accent outline-none"
                      onClick={handleSubmit}
                    >
                      <Send className="h-4 w-4 text-blue-500" /> Submit for Approval
                    </DropdownMenu.Item>
                  </>
                )}
                {obj.status === "submitted" && (
                  <DropdownMenu.Item
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-accent outline-none text-muted-foreground"
                    disabled
                  >
                    <Clock className="h-4 w-4" /> Awaiting Approval
                  </DropdownMenu.Item>
                )}
                {(obj.status === "draft" || obj.status === "rejected") && (
                  <DropdownMenu.Item
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-accent outline-none text-destructive"
                    onClick={handleDelete}
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </DropdownMenu.Item>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}

        {tab === "approvals" && (
          <Button
            size="sm"
            onClick={(e) => { e.stopPropagation(); onApprove(obj); }}
          >
            Review
          </Button>
        )}
      </div>

      {/* Manager feedback (rejected) */}
      {expanded && obj.status === "rejected" && obj.manager_feedback && (
        <div className="mx-4 mb-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
          <p className="text-xs font-medium text-red-700 dark:text-red-300 mb-1">Manager Feedback</p>
          <p className="text-sm text-red-600 dark:text-red-400">{obj.manager_feedback}</p>
          <button
            className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline"
            onClick={() => onEdit(obj)}
          >
            <RotateCcw className="h-3 w-3" /> Revise and resubmit
          </button>
        </div>
      )}

      {/* Manager feedback (approved) */}
      {expanded && obj.status === "approved" && obj.manager_feedback && (
        <div className="mx-4 mb-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3">
          <p className="text-xs font-medium text-green-700 dark:text-green-300 mb-1">Manager Comments</p>
          <p className="text-sm text-green-600 dark:text-green-400">{obj.manager_feedback}</p>
        </div>
      )}

      {/* Items */}
      {expanded && (
        <div className="border-t border-border divide-y divide-border">
          {obj.items.map((item) => {
            const hasEval = item.self_status || item.self_progress !== null;
            const hasManagerEval = item.manager_rating !== null;
            return (
              <div key={item.id} className="px-4 py-3 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">{item.title}</p>
                  <span className="text-xs rounded-full bg-primary/10 text-primary px-2 py-0.5 font-medium shrink-0">
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

                {/* Self evaluation */}
                {hasEval && (
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {item.self_status && (
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", SELF_STATUS_STYLES[item.self_status])}>
                        {SELF_STATUS_LABELS[item.self_status]}
                      </span>
                    )}
                    {item.self_progress !== null && (
                      <span className="text-xs text-muted-foreground">{item.self_progress}% progress</span>
                    )}
                    {item.self_comment && (
                      <span className="text-xs text-muted-foreground italic">"{item.self_comment}"</span>
                    )}
                  </div>
                )}

                {/* Manager evaluation */}
                {hasManagerEval && (
                  <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Manager:</span>
                    <span>Rating {item.manager_rating}/5</span>
                    {item.manager_comment && <span>· "{item.manager_comment}"</span>}
                  </div>
                )}
              </div>
            );
          })}
          <div className="px-4 py-2 flex justify-between text-xs text-muted-foreground bg-muted/20">
            <span>{obj.items.length} objectives</span>
            <span>Total weight: {totalWeight}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

interface ObjectivesClientProps {
  myObjectives: ObjectiveSet[];
  pendingApprovals: ObjectiveSet[];
  allObjectives: ObjectiveSet[];
  isAdmin: boolean;
  hasDirectReports: boolean;
}

export function ObjectivesClient({
  myObjectives,
  pendingApprovals,
  allObjectives,
  isAdmin,
  hasDirectReports,
}: ObjectivesClientProps) {
  const [tab, setTab] = React.useState<Tab>("mine");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editingObj, setEditingObj] = React.useState<ObjectiveSet | undefined>();
  const [approvingObj, setApprovingObj] = React.useState<ObjectiveSet | undefined>();

  const showApprovals = hasDirectReports || pendingApprovals.length > 0;

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "mine", label: "My Objectives" },
    ...(showApprovals ? [{ key: "approvals" as Tab, label: "Pending Approvals", count: pendingApprovals.length }] : []),
    ...(isAdmin ? [{ key: "all" as Tab, label: "All Objectives" }] : []),
  ];

  const currentList = tab === "mine" ? myObjectives : tab === "approvals" ? pendingApprovals : allObjectives;

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Objectives</h1>
          <p className="mt-1 text-muted-foreground">Set, track, and review quarterly and annual goals.</p>
        </div>
        {tab === "mine" && (
          <Button onClick={() => { setEditingObj(undefined); setCreateOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Set Objectives
          </Button>
        )}
      </div>

      {/* Tabs */}
      {tabs.length > 1 && (
        <div className="flex gap-1 border-b border-border">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className="rounded-full bg-destructive text-destructive-foreground text-xs px-1.5 py-0.5 font-semibold leading-none">
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {currentList.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <Target className="h-10 w-10 text-muted-foreground/40" />
          <div>
            <p className="font-medium text-sm">
              {tab === "mine" ? "No objectives yet" :
               tab === "approvals" ? "No pending approvals" :
               "No objectives in this org yet"}
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {tab === "mine" ? "Set your objectives for the current quarter or year." : ""}
            </p>
          </div>
          {tab === "mine" && (
            <Button variant="outline" size="sm" onClick={() => { setEditingObj(undefined); setCreateOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />
              Set Objectives
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {currentList.map((obj) => (
            <ObjectiveCard
              key={obj.id}
              obj={obj}
              tab={tab}
              onApprove={setApprovingObj}
              onEdit={(o) => { setEditingObj(o); setCreateOpen(true); }}
            />
          ))}
        </div>
      )}

      <CreateObjectiveDialog
        open={createOpen}
        onOpenChange={(v) => { setCreateOpen(v); if (!v) setEditingObj(undefined); }}
        editing={editingObj}
      />

      {approvingObj && (
        <ApproveDialog
          open
          onOpenChange={(v) => { if (!v) setApprovingObj(undefined); }}
          objective={approvingObj}
        />
      )}
    </>
  );
}
