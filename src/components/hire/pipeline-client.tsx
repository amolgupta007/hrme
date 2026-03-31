"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateApplicationStage } from "@/actions/hire";
import type { Application, ApplicationStage, Job } from "@/actions/hire";
import Link from "next/link";

const STAGES: { value: ApplicationStage; label: string; color: string; headerColor: string }[] = [
  { value: "applied", label: "Applied", color: "bg-gray-50 dark:bg-gray-900/30", headerColor: "bg-gray-200 dark:bg-gray-700" },
  { value: "screening", label: "Screening", color: "bg-blue-50 dark:bg-blue-950/20", headerColor: "bg-blue-200 dark:bg-blue-800" },
  { value: "interview_1", label: "Interview 1", color: "bg-violet-50 dark:bg-violet-950/20", headerColor: "bg-violet-200 dark:bg-violet-800" },
  { value: "interview_2", label: "Interview 2", color: "bg-indigo-50 dark:bg-indigo-950/20", headerColor: "bg-indigo-200 dark:bg-indigo-800" },
  { value: "final_round", label: "Final Round", color: "bg-amber-50 dark:bg-amber-950/20", headerColor: "bg-amber-200 dark:bg-amber-800" },
  { value: "offer", label: "Offer", color: "bg-emerald-50 dark:bg-emerald-950/20", headerColor: "bg-emerald-200 dark:bg-emerald-800" },
  { value: "hired", label: "Hired", color: "bg-green-50 dark:bg-green-950/20", headerColor: "bg-green-200 dark:bg-green-800" },
];

interface Props {
  applications: Application[];
  jobs: Job[];
  isAdmin: boolean;
}

export function PipelineClient({ applications, jobs, isAdmin }: Props) {
  const router = useRouter();
  const [filterJobId, setFilterJobId] = useState<string>("all");
  const [moving, setMoving] = useState<string | null>(null);
  const [showRejected, setShowRejected] = useState(false);

  const activeJobs = jobs.filter((j) => j.status === "active" || j.status === "paused");

  const filtered = applications.filter((a) => {
    if (a.stage === "rejected" && !showRejected) return false;
    if (filterJobId !== "all" && a.job_id !== filterJobId) return false;
    return true;
  });

  const byStage = (stage: ApplicationStage) => filtered.filter((a) => a.stage === stage);
  const rejectedCount = applications.filter((a) => a.stage === "rejected").length;

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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Pipeline</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {applications.filter((a) => a.stage !== "rejected").length} active candidates
            {rejectedCount > 0 && ` · ${rejectedCount} rejected`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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
          {rejectedCount > 0 && (
            <button
              onClick={() => setShowRejected((v) => !v)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
            >
              {showRejected ? "Hide" : "Show"} rejected ({rejectedCount})
            </button>
          )}
        </div>
      </div>

      {/* Kanban board — horizontal scroll */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-3 min-w-max">
          {STAGES.map((stage) => {
            const cards = byStage(stage.value);
            return (
              <div key={stage.value} className={`w-56 rounded-xl flex flex-col ${stage.color}`}>
                {/* Column header */}
                <div className={`rounded-t-xl px-3 py-2 ${stage.headerColor}`}>
                  <p className="text-xs font-semibold">{stage.label}</p>
                  <p className="text-xs opacity-70">{cards.length}</p>
                </div>

                {/* Cards */}
                <div className="flex-1 p-2 space-y-2 min-h-[120px]">
                  {cards.map((app) => (
                    <div
                      key={app.id}
                      className="rounded-lg border border-white/80 bg-white dark:border-white/10 dark:bg-white/5 p-3 shadow-sm"
                    >
                      <p className="text-xs font-semibold truncate">{app.candidate_name}</p>
                      <Link
                        href={`/hire/jobs/${app.job_id}`}
                        className="text-xs text-muted-foreground hover:text-indigo-600 truncate block mt-0.5"
                      >
                        {app.job_title}
                      </Link>

                      {/* Move stage */}
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
                  ))}

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
