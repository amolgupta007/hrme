"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BarChart3, ChevronDown, ChevronUp, X, Search, GripVertical } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  updateApplicationStage,
  bulkUpdateApplicationStage,
  rejectApplication,
  dispatchStageTransitionSideEffects,
  sendLOI,
} from "@/actions/hire";
import type { Application, ApplicationStage, Job } from "@/actions/hire";
import { computeDirection, type TransitionDirection } from "@/lib/hire/stage-direction";
import { planActionsForTransition, type TransitionAction } from "@/lib/hire/transitions";
import { ConfirmTransitionDialog } from "./confirm-transition-dialog";
import { ApplicationDetailDialog } from "./application-detail-dialog";
import Link from "next/link";

// Dialog primitives are now wrapped by ConfirmTransitionDialog — no direct import needed here.

const STAGES: { value: ApplicationStage; label: string; color: string; headerColor: string; dot: string }[] = [
  { value: "applied",     label: "Applied",     color: "bg-gray-50 dark:bg-gray-900/30",       headerColor: "bg-gray-200 dark:bg-gray-700",         dot: "bg-gray-400" },
  { value: "screening",   label: "Screening",   color: "bg-blue-50 dark:bg-blue-950/20",       headerColor: "bg-blue-200 dark:bg-blue-800",         dot: "bg-blue-500" },
  { value: "shortlisted", label: "Shortlisted", color: "bg-amber-50 dark:bg-amber-950/20",     headerColor: "bg-amber-200 dark:bg-amber-800",       dot: "bg-amber-500" },
  { value: "interview_1", label: "Interview 1", color: "bg-violet-50 dark:bg-violet-950/20",   headerColor: "bg-violet-200 dark:bg-violet-800",     dot: "bg-violet-500" },
  { value: "interview_2", label: "Interview 2", color: "bg-indigo-50 dark:bg-indigo-950/20",   headerColor: "bg-indigo-200 dark:bg-indigo-800",     dot: "bg-indigo-500" },
  { value: "final_round", label: "Final Round", color: "bg-orange-50 dark:bg-orange-950/20",   headerColor: "bg-orange-200 dark:bg-orange-800",     dot: "bg-orange-500" },
  { value: "offer",       label: "Offer",       color: "bg-emerald-50 dark:bg-emerald-950/20", headerColor: "bg-emerald-200 dark:bg-emerald-800",   dot: "bg-emerald-500" },
  { value: "hired",       label: "Hired",       color: "bg-green-50 dark:bg-green-950/20",     headerColor: "bg-green-200 dark:bg-green-800",       dot: "bg-green-500" },
];

const DATE_FILTERS = [
  { label: "All time", days: 0 },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

function daysAgo(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

interface Props {
  applications: Application[];
  jobs: Job[];
  isAdmin: boolean;
}

function DroppableColumn({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 p-2 space-y-2 min-h-[120px] transition-colors rounded-b-xl ${
        isOver ? "ring-2 ring-inset ring-indigo-400" : ""
      }`}
    >
      {children}
    </div>
  );
}

function DraggableCard({
  id,
  stage,
  children,
}: {
  id: string;
  stage: ApplicationStage;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    data: { stage },
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative ${isDragging ? "opacity-40" : ""}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Drag to move candidate"
        className="absolute top-1 right-1 z-10 p-1 text-muted-foreground/30 hover:text-muted-foreground hover:bg-muted/40 rounded cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      {children}
    </div>
  );
}

export function PipelineClient({ applications, jobs, isAdmin }: Props) {
  const router = useRouter();
  const [filterJobId, setFilterJobId] = useState<string>("all");
  const [filterDays, setFilterDays] = useState<number>(0);
  const [search, setSearch] = useState("");
  const [showRejected, setShowRejected] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStage, setBulkStage] = useState<ApplicationStage>("screening");
  const [bulkMoving, setBulkMoving] = useState(false);

  // Local optimistic copy of applications. Re-syncs on server prop change (router.refresh).
  const [localApps, setLocalApps] = useState<Application[]>(applications);
  useEffect(() => setLocalApps(applications), [applications]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const activeDragApp = activeDragId ? localApps.find((a) => a.id === activeDragId) ?? null : null;
  // True when the user starts dragging a card that is part of the multi-select.
  // Drop in that case applies to every selected card (bulk drag).
  const [bulkDrag, setBulkDrag] = useState(false);

  // Unified Confirm-Send popup (M3). One state drives every prompt:
  //  • Reject = prompt-first, reason required, email action default-on.
  //  • Backward = prompt-first, reason required, no email actions.
  //  • Forward with side-effects = prompt-after (stage already persisted),
  //    actions appear with Skip-All option.
  //  • Forward with no side-effects = no popup at all.
  type ConfirmConfig = {
    candidateLabel: string;
    fromStage: ApplicationStage;
    toStage: ApplicationStage;
    direction: TransitionDirection;
    actions: TransitionAction[];
    commentLabel?: string;
    commentRequired?: boolean;
    commentPlaceholder?: string;
    onSend: (args: { comment: string; enabledKeys: string[] }) => Promise<void>;
    onSkipAll?: () => Promise<void>;
    onCancel: () => void;
  };
  const [confirmConfig, setConfirmConfig] = useState<ConfirmConfig | null>(null);
  const [confirmSending, setConfirmSending] = useState(false);

  // Click-to-open detail dialog (lazy-loads transitions inside).
  const [detailApp, setDetailApp] = useState<Application | null>(null);

  const activeJobs = jobs.filter((j) => j.status === "active" || j.status === "paused");

  const filtered = useMemo(() => {
    const cutoff = filterDays > 0 ? Date.now() - filterDays * 86400000 : 0;
    return localApps.filter((a) => {
      if (a.stage === "rejected" && !showRejected) return false;
      if (filterJobId !== "all" && a.job_id !== filterJobId) return false;
      if (cutoff && new Date(a.applied_at).getTime() < cutoff) return false;
      if (search && !a.candidate_name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [localApps, filterJobId, filterDays, showRejected, search]);

  const byStage = (stage: ApplicationStage) => filtered.filter((a) => a.stage === stage);
  const rejectedCount = localApps.filter((a) => a.stage === "rejected").length;
  const activeCount = localApps.filter((a) => a.stage !== "rejected").length;

  const appliedTotal = localApps.filter((a) => a.stage !== "rejected").length || 1;
  const analytics = STAGES.map((s, i) => {
    const count = localApps.filter((a) => a.stage === s.value).length;
    const prevCount = i === 0 ? appliedTotal : localApps.filter((a) => a.stage === STAGES[i - 1].value).length;
    const pct = Math.round((count / appliedTotal) * 100);
    const dropOff = prevCount > 0 && i > 0 ? Math.round(((prevCount - count) / prevCount) * 100) : null;
    return { ...s, count, pct, dropOff };
  });

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll(stage: ApplicationStage) {
    const stageIds = byStage(stage).map((a) => a.id);
    const allSelected = stageIds.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        stageIds.forEach((id) => next.delete(id));
      } else {
        stageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  const stageLabel = (s: ApplicationStage) => STAGES.find((x) => x.value === s)?.label ?? s;

  // ---- M4: Letter of Interest flow ----
  // Special-cased screening → shortlisted transition. The card visually stays
  // in Screening with an amber `LOI pending` chip until the candidate accepts
  // or declines via the public /loi/[token] page.
  function openLOIPrompt(appId: string, candidateName: string) {
    setConfirmConfig({
      candidateLabel: candidateName,
      fromStage: "screening",
      toStage: "shortlisted",
      direction: "forward",
      actions: [
        {
          key: "loi-invite",
          label: "Send Letter of Interest to candidate",
          description:
            "Candidate gets an email with accept/decline buttons. The card stays in Screening with a pending chip until they respond. Accept advances the card to Shortlisted and notifies the hiring team. Decline auto-rejects with reason \"LOI declined\".",
          defaultEnabled: true,
        },
      ],
      onSend: async ({ enabledKeys }) => {
        if (!enabledKeys.includes("loi-invite")) {
          toast.error("Cannot shortlist this candidate without sending the LOI.");
          return;
        }
        setConfirmSending(true);
        try {
          const result = await sendLOI(appId);
          if (!result.success) {
            toast.error(result.error);
            return;
          }
          toast.success("LOI sent — waiting for candidate response");
          setConfirmConfig(null);
          router.refresh();
        } finally {
          setConfirmSending(false);
        }
      },
      onCancel: () => setConfirmConfig(null),
    });
  }

  // ---- Single-card move flow ----
  // Reject → prompt-first (no optimistic), unified popup with email checkbox + reason.
  // Backward → prompt-first (no optimistic) with required reason.
  // Forward + actions → optimistic move, then prompt-after popup with action checkboxes + Skip All.
  // Forward + no actions → optimistic move + toast, no popup.
  async function handleMove(appId: string, stage: ApplicationStage) {
    const current = localApps.find((a) => a.id === appId);
    if (!current) return;
    const fromStage = current.stage;

    if (stage === "rejected") {
      openRejectPrompt([appId], current.candidate_name, fromStage);
      return;
    }

    // M4: screening → shortlisted is gated on LOI accept. Show Send-LOI popup
    // instead of directly advancing the stage.
    if (fromStage === "screening" && stage === "shortlisted") {
      if (current.loi_status === "pending") {
        toast.error("LOI already pending. Wait for the candidate or resend from the card.");
        return;
      }
      openLOIPrompt(appId, current.candidate_name);
      return;
    }

    const direction = computeDirection(fromStage, stage);
    const actions = planActionsForTransition(direction, fromStage, stage);

    if (direction === "backward") {
      openBackwardPrompt([appId], current.candidate_name, fromStage, stage, actions);
      return;
    }

    // Forward path: optimistic move + server call. Popup only if actions queued.
    const snapshot = localApps;
    setLocalApps((apps) => apps.map((a) => (a.id === appId ? { ...a, stage } : a)));
    setMoving(appId);
    try {
      const result = await updateApplicationStage(appId, stage);
      if (!result.success) {
        setLocalApps(snapshot);
        toast.error(result.error);
        return;
      }
      const transitionId = result.data.transitionId;
      if (actions.length > 0 && transitionId) {
        openPostMovePopup(current.candidate_name, fromStage, stage, direction, actions, transitionId);
      } else {
        toast.success(`Moved to ${stageLabel(stage)}`);
        router.refresh();
      }
    } finally {
      setMoving(null);
    }
  }

  async function handleBulkMove() {
    if (!selected.size) return;
    const ids = Array.from(selected);

    if (bulkStage === "rejected") {
      openRejectPrompt(ids, `${ids.length} candidates`, null);
      return;
    }

    const targets = localApps.filter((a) => selected.has(a.id));
    const hasBackward = targets.some((a) => computeDirection(a.stage, bulkStage) === "backward");

    if (hasBackward) {
      const firstBackward = targets.find((a) => computeDirection(a.stage, bulkStage) === "backward")!;
      openBackwardPrompt(ids, `${ids.length} candidates`, firstBackward.stage, bulkStage, []);
      return;
    }

    setBulkMoving(true);
    const result = await bulkUpdateApplicationStage(ids, bulkStage);
    setBulkMoving(false);
    if (result.success) {
      toast.success(`Moved ${ids.length} candidates to ${stageLabel(bulkStage)}`);
      setSelected(new Set());
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  // ---- Confirm-Send popup wiring (M3) ----

  function openPostMovePopup(
    candidateLabel: string,
    fromStage: ApplicationStage,
    toStage: ApplicationStage,
    direction: TransitionDirection,
    actions: TransitionAction[],
    transitionId: string,
  ) {
    setConfirmConfig({
      candidateLabel,
      fromStage,
      toStage,
      direction,
      actions,
      onSend: async ({ enabledKeys }) => {
        setConfirmSending(true);
        try {
          const dispatchResult = await dispatchStageTransitionSideEffects(transitionId, enabledKeys);
          if (!dispatchResult.success) {
            toast.error(dispatchResult.error);
            return;
          }
          const sent = Object.values(dispatchResult.data.results).filter((r) => r === "sent").length;
          const failed = Object.values(dispatchResult.data.results).filter((r) => r === "failed").length;
          if (failed > 0) toast.error(`Moved to ${stageLabel(toStage)} — ${failed} action${failed > 1 ? "s" : ""} failed`);
          else if (sent > 0) toast.success(`Moved to ${stageLabel(toStage)} — sent ${sent} action${sent > 1 ? "s" : ""}`);
          else toast.success(`Moved to ${stageLabel(toStage)}`);
          setConfirmConfig(null);
          router.refresh();
        } finally {
          setConfirmSending(false);
        }
      },
      onSkipAll: async () => {
        setConfirmSending(true);
        try {
          await dispatchStageTransitionSideEffects(transitionId, []);
          toast.success(`Moved to ${stageLabel(toStage)} — no actions sent`);
          setConfirmConfig(null);
          router.refresh();
        } finally {
          setConfirmSending(false);
        }
      },
      onCancel: () => setConfirmConfig(null),
    });
  }

  function openBackwardPrompt(
    ids: string[],
    candidateLabel: string,
    fromStage: ApplicationStage,
    toStage: ApplicationStage,
    actions: TransitionAction[],
  ) {
    setConfirmConfig({
      candidateLabel,
      fromStage,
      toStage,
      direction: "backward",
      actions,
      commentLabel: "Reason for moving back",
      commentRequired: true,
      commentPlaceholder: "A short reason for the audit log…",
      onSend: async ({ comment, enabledKeys }) => {
        setConfirmSending(true);
        try {
          const result =
            ids.length === 1
              ? await updateApplicationStage(ids[0], toStage, { comment })
              : await bulkUpdateApplicationStage(ids, toStage, { comment });
          if (!result.success) {
            toast.error(result.error);
            return;
          }
          // Optimistic update only after server success — backward is prompt-first.
          setLocalApps((apps) => apps.map((a) => (ids.includes(a.id) ? { ...a, stage: toStage } : a)));

          // Dispatch any actions per transition row.
          const transitionIds: string[] = "transitionId" in result.data
            ? result.data.transitionId
              ? [result.data.transitionId]
              : []
            : result.data.transitionIds;
          if (transitionIds.length > 0 && actions.length > 0) {
            await Promise.all(
              transitionIds.map((tid) => dispatchStageTransitionSideEffects(tid, enabledKeys)),
            );
          }

          toast.success(
            ids.length === 1
              ? `Moved back to ${stageLabel(toStage)}`
              : `Moved ${ids.length} candidates back to ${stageLabel(toStage)}`,
          );
          if (ids.length > 1) setSelected(new Set());
          setConfirmConfig(null);
          router.refresh();
        } finally {
          setConfirmSending(false);
        }
      },
      onCancel: () => setConfirmConfig(null),
    });
  }

  function openRejectPrompt(
    ids: string[],
    candidateLabel: string,
    fromStage: ApplicationStage | null,
  ) {
    // Use the most likely fromStage for template selection. For bulk, just use
    // the most common origin; per-row dispatch will pick the right template
    // based on each row's own from_stage in the audit row.
    const targets = localApps.filter((a) => ids.includes(a.id));
    const fromStageForPrompt = fromStage ?? targets[0]?.stage ?? "applied";
    const actions = planActionsForTransition("reject", fromStageForPrompt, "rejected");

    setConfirmConfig({
      candidateLabel,
      fromStage: fromStageForPrompt,
      toStage: "rejected",
      direction: "reject",
      actions,
      commentLabel: "Internal reason",
      commentRequired: true,
      commentPlaceholder: "e.g. compensation mismatch, weak culture fit, lost to competitor…",
      onSend: async ({ comment, enabledKeys }) => {
        setConfirmSending(true);
        try {
          const results = await Promise.all(ids.map((id) => rejectApplication(id, comment)));
          const failures = results.filter((r) => !r.success);
          if (failures.length > 0) {
            toast.error(`Failed to reject: ${(failures[0] as { error: string }).error}`);
            return;
          }
          // Optimistic move to rejected
          setLocalApps((apps) =>
            apps.map((a) =>
              ids.includes(a.id) ? { ...a, stage: "rejected" as ApplicationStage } : a,
            ),
          );
          setShowRejected(true);

          // Dispatch rejection email per transition (template chosen server-side per from_stage)
          const transitionIds = results
            .filter((r): r is { success: true; data: { transitionId: string | null } } => r.success)
            .map((r) => r.data.transitionId)
            .filter((tid): tid is string => tid !== null);
          if (transitionIds.length > 0 && enabledKeys.length > 0) {
            await Promise.all(
              transitionIds.map((tid) => dispatchStageTransitionSideEffects(tid, enabledKeys)),
            );
          }

          toast.success(ids.length === 1 ? "Candidate rejected" : `Rejected ${ids.length} candidates`);
          if (ids.length > 1) setSelected(new Set());
          setConfirmConfig(null);
          router.refresh();
        } finally {
          setConfirmSending(false);
        }
      },
      onCancel: () => setConfirmConfig(null),
    });
  }

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    setActiveDragId(id);
    // Bulk drag mode kicks in when the user picks up one of the selected cards.
    setBulkDrag(selected.size > 1 && selected.has(id));
  }

  async function onDragEnd(e: DragEndEvent) {
    const id = activeDragId;
    const wasBulkDrag = bulkDrag;
    setActiveDragId(null);
    setBulkDrag(false);
    if (!id || !e.over) return;
    const fromStage = e.active.data.current?.stage as ApplicationStage | undefined;
    const overId = String(e.over.id);
    if (!overId.startsWith("col:")) return;
    const toStage = overId.slice(4) as ApplicationStage;
    if (!fromStage || fromStage === toStage) return;

    if (wasBulkDrag) {
      const ids = Array.from(selected);
      const targets = localApps.filter((a) => selected.has(a.id));
      const hasBackward = targets.some((a) => computeDirection(a.stage, toStage) === "backward");

      if (toStage === "rejected") {
        openRejectPrompt(ids, `${ids.length} candidates`, null);
        return;
      }
      if (hasBackward) {
        const firstBackward = targets.find((a) => computeDirection(a.stage, toStage) === "backward")!;
        openBackwardPrompt(ids, `${ids.length} candidates`, firstBackward.stage, toStage, []);
        return;
      }

      // Forward bulk: optimistic move + server update, no popup (M3 keeps bulk-forward simple)
      const snapshot = localApps;
      setLocalApps((apps) => apps.map((a) => (selected.has(a.id) ? { ...a, stage: toStage } : a)));
      setMoving(id);
      try {
        const result = await bulkUpdateApplicationStage(ids, toStage);
        if (result.success) {
          toast.success(`Moved ${ids.length} candidates to ${stageLabel(toStage)}`);
          setSelected(new Set());
          router.refresh();
        } else {
          setLocalApps(snapshot);
          toast.error(result.error);
        }
      } finally {
        setMoving(null);
      }
      return;
    }

    // Single-card drag → route through the same handleMove gate so the popup
    // logic (reject prompt-first, backward prompt-first, forward optimistic +
    // post-move popup) is identical to dropdown moves.
    await handleMove(id, toStage);
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold">Pipeline</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {activeCount} active candidates
              {rejectedCount > 0 && ` · ${rejectedCount} rejected`}
            </p>
          </div>
          <button
            onClick={() => setShowAnalytics((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300"
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Analytics
            {showAnalytics ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>

        {/* Analytics Panel */}
        {showAnalytics && (
          <div className="rounded-xl border border-indigo-100 dark:border-indigo-900/40 bg-white dark:bg-[#150e2b] p-4">
            <p className="text-xs font-semibold text-muted-foreground mb-3">Stage Conversion Funnel</p>
            <div className="space-y-2">
              {analytics.map((s) => (
                <div key={s.value} className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${s.dot}`} />
                  <span className="text-xs w-24 shrink-0">{s.label}</span>
                  <div className="flex-1 bg-muted/40 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${s.dot}`}
                      style={{ width: `${s.pct}%`, opacity: 0.7 }}
                    />
                  </div>
                  <span className="text-xs font-semibold w-6 text-right">{s.count}</span>
                  <span className="text-xs text-muted-foreground w-8 text-right">{s.pct}%</span>
                  {s.dropOff !== null && s.dropOff > 0 && (
                    <span className="text-xs text-red-500 w-16 text-right">-{s.dropOff}% drop</span>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">% relative to total active candidates ({activeCount}). Rejected excluded.</p>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              className="rounded-lg border border-input bg-background pl-8 pr-3 py-1.5 text-sm w-44 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              placeholder="Search name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
            value={filterJobId}
            onChange={(e) => setFilterJobId(e.target.value)}
          >
            <option value="all">All Jobs</option>
            {activeJobs.map((j) => (
              <option key={j.id} value={j.id}>{j.title}</option>
            ))}
          </select>

          <select
            className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
            value={filterDays}
            onChange={(e) => setFilterDays(Number(e.target.value))}
          >
            {DATE_FILTERS.map((f) => (
              <option key={f.days} value={f.days}>{f.label}</option>
            ))}
          </select>

          {rejectedCount > 0 && (
            <button
              onClick={() => setShowRejected((v) => !v)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
            >
              {showRejected ? "Hide" : "Show"} rejected ({rejectedCount})
            </button>
          )}

          {(search || filterJobId !== "all" || filterDays > 0) && (
            <button
              onClick={() => { setSearch(""); setFilterJobId("all"); setFilterDays(0); }}
              className="flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>

        {/* Bulk Action Bar */}
        {isAdmin && selected.size > 0 && (
          <div className="flex items-center gap-3 rounded-xl bg-indigo-600 px-4 py-2.5 text-white">
            <span className="text-sm font-medium">{selected.size} selected</span>
            <div className="flex items-center gap-2 ml-auto flex-wrap">
              <span className="text-xs opacity-80">Move to:</span>
              <select
                className="rounded-lg bg-indigo-700 border border-indigo-500 px-2 py-1 text-xs text-white"
                value={bulkStage}
                onChange={(e) => setBulkStage(e.target.value as ApplicationStage)}
              >
                {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                <option value="rejected">Reject</option>
              </select>
              <button
                onClick={handleBulkMove}
                disabled={bulkMoving}
                className="rounded-lg bg-white text-indigo-700 font-semibold px-3 py-1 text-xs hover:bg-indigo-50 disabled:opacity-60"
              >
                {bulkMoving ? "Moving…" : "Apply"}
              </button>
              <button onClick={clearSelection} className="text-xs opacity-70 hover:opacity-100 ml-1">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Kanban board */}
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3 min-w-max">
            {STAGES.map((stage) => {
              const cards = byStage(stage.value);
              const stageIds = cards.map((a) => a.id);
              const allSelected = stageIds.length > 0 && stageIds.every((id) => selected.has(id));

              return (
                <div key={stage.value} className={`w-60 rounded-xl flex flex-col ${stage.color}`}>
                  {/* Column header */}
                  <div className={`rounded-t-xl px-3 py-2 ${stage.headerColor} flex items-center justify-between`}>
                    <div>
                      <p className="text-xs font-semibold">{stage.label}</p>
                      <p className="text-xs opacity-70">{cards.length} candidates</p>
                    </div>
                    {isAdmin && cards.length > 0 && (
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 cursor-pointer rounded"
                        checked={allSelected}
                        onChange={() => toggleSelectAll(stage.value)}
                        title="Select all in stage"
                      />
                    )}
                  </div>

                  {/* Droppable card area */}
                  <DroppableColumn id={`col:${stage.value}`}>
                    {cards.map((app) => {
                      const isSelected = selected.has(app.id);
                      const age = daysAgo(app.applied_at);
                      // LOI-pending cards lock until the candidate responds — drag would
                      // bypass the gate. Dropdown is also disabled via the same flag below.
                      const isLoiLocked = app.loi_status === "pending";
                      const isDraggable = isAdmin && stage.value !== "hired" && !isLoiLocked;

                      const cardBody = (
                        <div
                          className={`rounded-lg border bg-white dark:bg-white/5 p-3 shadow-sm transition-colors ${
                            isSelected
                              ? "border-indigo-400 ring-1 ring-indigo-400 dark:border-indigo-500"
                              : "border-white/80 dark:border-white/10"
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            {isAdmin && (
                              <input
                                type="checkbox"
                                className="mt-0.5 h-3.5 w-3.5 cursor-pointer rounded shrink-0"
                                checked={isSelected}
                                onChange={() => toggleSelect(app.id)}
                              />
                            )}
                            {/* Leave room for the drag handle in the top-right */}
                            <div className={`min-w-0 flex-1 ${isDraggable ? "pr-5" : ""}`}>
                              <button
                                type="button"
                                onClick={() => setDetailApp(app)}
                                className="text-xs font-semibold truncate text-left w-full hover:text-indigo-600 hover:underline"
                              >
                                {app.candidate_name}
                              </button>
                              <Link
                                href={`/hire/jobs/${app.job_id}`}
                                className="text-xs text-muted-foreground hover:text-indigo-600 truncate block mt-0.5"
                              >
                                {app.job_title}
                              </Link>
                              <p className="text-xs text-muted-foreground/60 mt-1">
                                {age === 0 ? "Today" : age === 1 ? "1d ago" : `${age}d ago`}
                              </p>
                              {app.loi_status && (
                                <p
                                  className={`mt-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                    app.loi_status === "pending"
                                      ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                                      : app.loi_status === "accepted"
                                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                                        : app.loi_status === "declined"
                                          ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                                          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                                  }`}
                                  title={
                                    app.loi_status === "pending" && app.loi_expires_at
                                      ? `Expires ${new Date(app.loi_expires_at).toLocaleDateString()}`
                                      : undefined
                                  }
                                >
                                  LOI {app.loi_status}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Dropdown fallback — kept on all viewports per locked plan Q2 */}
                          {isAdmin && stage.value !== "hired" && (
                            <select
                              className="mt-2 w-full rounded border border-input bg-background px-1.5 py-1 text-xs"
                              value={stage.value}
                              disabled={moving === app.id}
                              onChange={(e) => handleMove(app.id, e.target.value as ApplicationStage)}
                            >
                              {STAGES.map((s) => (
                                <option key={s.value} value={s.value}>{s.label}</option>
                              ))}
                              <option value="rejected">Reject</option>
                            </select>
                          )}
                        </div>
                      );

                      if (!isDraggable) {
                        return <div key={app.id}>{cardBody}</div>;
                      }

                      return (
                        <DraggableCard key={app.id} id={app.id} stage={stage.value}>
                          {cardBody}
                        </DraggableCard>
                      );
                    })}

                    {cards.length === 0 && (
                      <p className="text-center text-xs text-muted-foreground pt-4">Empty</p>
                    )}
                  </DroppableColumn>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDragApp ? (
          <div className="rounded-lg border-2 border-indigo-400 bg-white dark:bg-[#150e2b] p-3 shadow-2xl w-56 cursor-grabbing relative">
            {bulkDrag && (
              <span className="absolute -top-2 -right-2 rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-semibold text-white shadow">
                {selected.size}
              </span>
            )}
            <p className="text-xs font-semibold truncate">
              {bulkDrag ? `${selected.size} candidates` : activeDragApp.candidate_name}
            </p>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {bulkDrag ? "Drop to move all selected" : activeDragApp.job_title}
            </p>
          </div>
        ) : null}
      </DragOverlay>

      {/* Unified Confirm-Send dialog (M3) — handles forward/backward/reject. */}
      {confirmConfig && (
        <ConfirmTransitionDialog
          open={true}
          onClose={confirmConfig.onCancel}
          candidateLabel={confirmConfig.candidateLabel}
          fromStageLabel={stageLabel(confirmConfig.fromStage)}
          toStageLabel={stageLabel(confirmConfig.toStage)}
          direction={confirmConfig.direction}
          actions={confirmConfig.actions}
          commentLabel={confirmConfig.commentLabel}
          commentRequired={confirmConfig.commentRequired}
          commentPlaceholder={confirmConfig.commentPlaceholder}
          sending={confirmSending}
          onSend={confirmConfig.onSend}
          onSkipAll={confirmConfig.onSkipAll}
        />
      )}

      <ApplicationDetailDialog
        application={detailApp}
        open={detailApp !== null}
        onOpenChange={(open) => {
          if (!open) setDetailApp(null);
        }}
      />
    </DndContext>
  );
}
