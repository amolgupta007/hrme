"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BarChart3, ChevronDown, ChevronUp, X, Search } from "lucide-react";
import { updateApplicationStage, bulkUpdateApplicationStage } from "@/actions/hire";
import type { Application, ApplicationStage, Job } from "@/actions/hire";
import Link from "next/link";

const STAGES: { value: ApplicationStage; label: string; color: string; headerColor: string; dot: string }[] = [
  { value: "applied",     label: "Applied",     color: "bg-gray-50 dark:bg-gray-900/30",       headerColor: "bg-gray-200 dark:bg-gray-700",         dot: "bg-gray-400" },
  { value: "screening",   label: "Screening",   color: "bg-blue-50 dark:bg-blue-950/20",       headerColor: "bg-blue-200 dark:bg-blue-800",         dot: "bg-blue-500" },
  { value: "interview_1", label: "Interview 1", color: "bg-violet-50 dark:bg-violet-950/20",   headerColor: "bg-violet-200 dark:bg-violet-800",     dot: "bg-violet-500" },
  { value: "interview_2", label: "Interview 2", color: "bg-indigo-50 dark:bg-indigo-950/20",   headerColor: "bg-indigo-200 dark:bg-indigo-800",     dot: "bg-indigo-500" },
  { value: "final_round", label: "Final Round", color: "bg-amber-50 dark:bg-amber-950/20",     headerColor: "bg-amber-200 dark:bg-amber-800",       dot: "bg-amber-500" },
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

  const activeJobs = jobs.filter((j) => j.status === "active" || j.status === "paused");

  const filtered = useMemo(() => {
    const cutoff = filterDays > 0 ? Date.now() - filterDays * 86400000 : 0;
    return applications.filter((a) => {
      if (a.stage === "rejected" && !showRejected) return false;
      if (filterJobId !== "all" && a.job_id !== filterJobId) return false;
      if (cutoff && new Date(a.applied_at).getTime() < cutoff) return false;
      if (search && !a.candidate_name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [applications, filterJobId, filterDays, showRejected, search]);

  const byStage = (stage: ApplicationStage) => filtered.filter((a) => a.stage === stage);
  const rejectedCount = applications.filter((a) => a.stage === "rejected").length;
  const activeCount = applications.filter((a) => a.stage !== "rejected").length;

  // Analytics: conversion from applied baseline
  const appliedTotal = applications.filter((a) => a.stage !== "rejected").length || 1;
  const analytics = STAGES.map((s, i) => {
    const count = applications.filter((a) => a.stage === s.value).length;
    const prevCount = i === 0 ? appliedTotal : applications.filter((a) => a.stage === STAGES[i - 1].value).length;
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
    setMoving(appId);
    try {
      const result = await updateApplicationStage(appId, stage);
      if (result.success) {
        toast.success(`Moved to ${STAGES.find((s) => s.value === stage)?.label ?? stage}`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setMoving(null);
    }
  }

  async function handleBulkMove() {
    if (!selected.size) return;
    setBulkMoving(true);
    const result = await bulkUpdateApplicationStage(Array.from(selected), bulkStage);
    setBulkMoving(false);
    if (result.success) {
      toast.success(`Moved ${selected.size} candidates to ${STAGES.find((s) => s.value === bulkStage)?.label}`);
      setSelected(new Set());
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  return (
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
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            className="rounded-lg border border-input bg-background pl-8 pr-3 py-1.5 text-sm w-44 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            placeholder="Search name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Job filter */}
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

        {/* Date filter */}
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

                {/* Cards */}
                <div className="flex-1 p-2 space-y-2 min-h-[120px]">
                  {cards.map((app) => {
                    const isSelected = selected.has(app.id);
                    const age = daysAgo(app.applied_at);
                    return (
                      <div
                        key={app.id}
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
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold truncate">{app.candidate_name}</p>
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

                        {/* Single move */}
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
                  })}

                  {cards.length === 0 && (
                    <p className="text-center text-xs text-muted-foreground pt-4">Empty</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
