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
import { updateApplicationStage, bulkUpdateApplicationStage, rejectApplication } from "@/actions/hire";
import type { Application, ApplicationStage, Job } from "@/actions/hire";
import { computeDirection } from "@/lib/hire/stage-direction";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ApplicationDetailDialog } from "./application-detail-dialog";
import Link from "next/link";

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

  // Backward-move prompt — opened whenever a drop/dropdown moves a card to an earlier stage.
  // Snapshot lets us roll back the optimistic update if the admin cancels the prompt.
  type BackwardPrompt = {
    ids: string[];
    fromStage: ApplicationStage;
    toStage: ApplicationStage;
    candidateName: string;
    snapshot: Application[];
  };
  const [pendingBackward, setPendingBackward] = useState<BackwardPrompt | null>(null);
  const [backwardComment, setBackwardComment] = useState("");
  const [backwardSubmitting, setBackwardSubmitting] = useState(false);

  // Rejection prompt — required internal reason for the audit log.
  // The reason is internal-only; the candidate email (M3+) is a neutral sorry note.
  type RejectPrompt = { ids: string[]; candidateName: string };
  const [pendingReject, setPendingReject] = useState<RejectPrompt | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectSubmitting, setRejectSubmitting] = useState(false);

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

  async function handleMove(appId: string, stage: ApplicationStage) {
    const current = localApps.find((a) => a.id === appId);
    if (!current) return;

    // Rejection: prompt-first (no optimistic move). The Rejected column is
    // hidden by default — vanishing cards mid-cancel is disorienting.
    if (stage === "rejected") {
      setPendingReject({ ids: [appId], candidateName: current.candidate_name });
      setRejectReason("");
      return;
    }

    const direction = computeDirection(current.stage, stage);

    // Snapshot before any optimistic mutation.
    const snapshot = localApps;
    setLocalApps((apps) => apps.map((a) => (a.id === appId ? { ...a, stage } : a)));

    if (direction === "backward") {
      // Defer the server call — admin must enter a reason in the prompt.
      setPendingBackward({
        ids: [appId],
        fromStage: current.stage,
        toStage: stage,
        candidateName: current.candidate_name,
        snapshot,
      });
      setBackwardComment("");
      return;
    }

    setMoving(appId);
    try {
      const result = await updateApplicationStage(appId, stage);
      if (result.success) {
        toast.success(`Moved to ${STAGES.find((s) => s.value === stage)?.label ?? stage}`);
        router.refresh();
      } else {
        setLocalApps(snapshot);
        toast.error(result.error);
      }
    } finally {
      setMoving(null);
    }
  }

  async function handleBulkMove() {
    if (!selected.size) return;

    // Bulk reject: prompt for one shared internal reason, then loop reject server-side.
    if (bulkStage === "rejected") {
      setPendingReject({
        ids: Array.from(selected),
        candidateName: `${selected.size} candidates`,
      });
      setRejectReason("");
      return;
    }

    setBulkMoving(true);
    const result = await bulkUpdateApplicationStage(Array.from(selected), bulkStage);
    setBulkMoving(false);
    if (result.success) {
      toast.success(`Moved ${selected.size} candidates to ${STAGES.find((s) => s.value === bulkStage)?.label}`);
      setSelected(new Set());
      router.refresh();
    } else if (/reason is required/i.test(result.error)) {
      // The toolbar bulk action doesn't gather a comment; prompt for one.
      const stages = localApps.filter((a) => selected.has(a.id)).map((a) => a.stage);
      const firstBackward = stages.find((s) => computeDirection(s, bulkStage) === "backward");
      if (firstBackward) {
        setPendingBackward({
          ids: Array.from(selected),
          fromStage: firstBackward,
          toStage: bulkStage,
          candidateName: `${selected.size} candidates`,
          snapshot: localApps,
        });
        setBackwardComment("");
      } else {
        toast.error(result.error);
      }
    } else {
      toast.error(result.error);
    }
  }

  async function confirmBackwardMove() {
    if (!pendingBackward || !backwardComment.trim()) return;
    setBackwardSubmitting(true);
    const { ids, toStage, snapshot } = pendingBackward;
    try {
      const result =
        ids.length === 1
          ? await updateApplicationStage(ids[0], toStage, { comment: backwardComment.trim() })
          : await bulkUpdateApplicationStage(ids, toStage, { comment: backwardComment.trim() });

      if (result.success) {
        toast.success(
          ids.length === 1
            ? `Moved back to ${STAGES.find((s) => s.value === toStage)?.label ?? toStage}`
            : `Moved ${ids.length} candidates back to ${STAGES.find((s) => s.value === toStage)?.label}`,
        );
        if (ids.length > 1) setSelected(new Set());
        setPendingBackward(null);
        setBackwardComment("");
        router.refresh();
      } else {
        setLocalApps(snapshot);
        setPendingBackward(null);
        setBackwardComment("");
        toast.error(result.error);
      }
    } finally {
      setBackwardSubmitting(false);
    }
  }

  function cancelBackwardMove() {
    if (!pendingBackward) return;
    setLocalApps(pendingBackward.snapshot);
    setPendingBackward(null);
    setBackwardComment("");
  }

  async function confirmReject() {
    if (!pendingReject || !rejectReason.trim()) return;
    setRejectSubmitting(true);
    const { ids } = pendingReject;
    const reason = rejectReason.trim();

    const snapshot = localApps;
    setLocalApps((apps) =>
      apps.map((a) => (ids.includes(a.id) ? { ...a, stage: "rejected" as ApplicationStage } : a)),
    );
    setShowRejected(true);

    try {
      const results = await Promise.all(ids.map((id) => rejectApplication(id, reason)));
      const failures = results.filter((r) => !r.success);
      if (failures.length === 0) {
        toast.success(
          ids.length === 1 ? "Candidate rejected" : `Rejected ${ids.length} candidates`,
        );
        if (ids.length > 1) setSelected(new Set());
        setPendingReject(null);
        setRejectReason("");
        router.refresh();
      } else {
        setLocalApps(snapshot);
        setPendingReject(null);
        setRejectReason("");
        toast.error(`Failed to reject: ${(failures[0] as { error: string }).error}`);
      }
    } finally {
      setRejectSubmitting(false);
    }
  }

  function cancelReject() {
    setPendingReject(null);
    setRejectReason("");
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

    const snapshot = localApps;

    if (wasBulkDrag) {
      // Move every selected card.
      const ids = Array.from(selected);
      const targets = localApps.filter((a) => selected.has(a.id));
      const hasBackward = targets.some((a) => computeDirection(a.stage, toStage) === "backward");
      setLocalApps((apps) => apps.map((a) => (selected.has(a.id) ? { ...a, stage: toStage } : a)));

      if (hasBackward) {
        const firstBackward = targets.find((a) => computeDirection(a.stage, toStage) === "backward")!;
        setPendingBackward({
          ids,
          fromStage: firstBackward.stage,
          toStage,
          candidateName: `${ids.length} candidates`,
          snapshot,
        });
        setBackwardComment("");
        return;
      }

      setMoving(id);
      try {
        const result = await bulkUpdateApplicationStage(ids, toStage);
        if (result.success) {
          toast.success(`Moved ${ids.length} candidates to ${STAGES.find((s) => s.value === toStage)?.label ?? toStage}`);
          setSelected(new Set());
          router.refresh();
        } else {
          setLocalApps(snapshot);
          toast.error(result.error);
        }
      } catch {
        setLocalApps(snapshot);
        toast.error("Failed to move candidates");
      } finally {
        setMoving(null);
      }
      return;
    }

    // Single-card drag.
    const direction = computeDirection(fromStage, toStage);
    setLocalApps((apps) => apps.map((a) => (a.id === id ? { ...a, stage: toStage } : a)));

    if (direction === "backward") {
      const card = snapshot.find((a) => a.id === id);
      setPendingBackward({
        ids: [id],
        fromStage,
        toStage,
        candidateName: card?.candidate_name ?? "candidate",
        snapshot,
      });
      setBackwardComment("");
      return;
    }

    setMoving(id);
    try {
      const result = await updateApplicationStage(id, toStage);
      if (result.success) {
        toast.success(`Moved to ${STAGES.find((s) => s.value === toStage)?.label ?? toStage}`);
        router.refresh();
      } else {
        setLocalApps(snapshot);
        toast.error(result.error);
      }
    } catch {
      setLocalApps(snapshot);
      toast.error("Failed to move candidate");
    } finally {
      setMoving(null);
    }
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
                      const isDraggable = isAdmin && stage.value !== "hired";

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

      {/* Backward-move comment prompt — required reason per M2 acceptance */}
      <Dialog
        open={pendingBackward !== null}
        onOpenChange={(open) => {
          if (!open) cancelBackwardMove();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Why are you moving this back?</DialogTitle>
            <DialogDescription>
              {pendingBackward && (
                <>
                  {pendingBackward.candidateName} —{" "}
                  <span className="font-medium">{STAGES.find((s) => s.value === pendingBackward.fromStage)?.label ?? pendingBackward.fromStage}</span>
                  {" → "}
                  <span className="font-medium">{STAGES.find((s) => s.value === pendingBackward.toStage)?.label ?? pendingBackward.toStage}</span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <textarea
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[100px] focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            placeholder="A short reason for the audit log (required)…"
            value={backwardComment}
            onChange={(e) => setBackwardComment(e.target.value)}
            autoFocus
          />
          <DialogFooter className="flex gap-2 justify-end mt-2">
            <button
              type="button"
              onClick={cancelBackwardMove}
              disabled={backwardSubmitting}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmBackwardMove}
              disabled={!backwardComment.trim() || backwardSubmitting}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {backwardSubmitting ? "Saving…" : "Save & Move"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rejection internal-reason prompt — required, NOT shown to the candidate */}
      <Dialog
        open={pendingReject !== null}
        onOpenChange={(open) => {
          if (!open) cancelReject();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject {pendingReject?.candidateName}?</DialogTitle>
            <DialogDescription>
              The reason is for your internal audit log only. The candidate will receive a neutral rejection email
              (no reason text) when email notifications are wired up.
            </DialogDescription>
          </DialogHeader>
          <textarea
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[100px] focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
            placeholder="Internal reason (e.g. compensation mismatch, weak culture fit, lost to competitor)…"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            autoFocus
          />
          <DialogFooter className="flex gap-2 justify-end mt-2">
            <button
              type="button"
              onClick={cancelReject}
              disabled={rejectSubmitting}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmReject}
              disabled={!rejectReason.trim() || rejectSubmitting}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {rejectSubmitting ? "Rejecting…" : "Reject"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
