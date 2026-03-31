"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, MapPin, Briefcase, Users, Pencil, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { JobDialog } from "./job-dialog";
import { updateApplicationStage, rejectApplication } from "@/actions/hire";
import type { Job, Application, ApplicationStage } from "@/actions/hire";
import type { Department } from "@/types";

const STAGES: { value: ApplicationStage; label: string; color: string }[] = [
  { value: "applied", label: "Applied", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  { value: "screening", label: "Screening", color: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  { value: "interview_1", label: "Interview 1", color: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300" },
  { value: "interview_2", label: "Interview 2", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" },
  { value: "final_round", label: "Final Round", color: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  { value: "offer", label: "Offer", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  { value: "hired", label: "Hired", color: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" },
  { value: "rejected", label: "Rejected", color: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
];

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  draft: "bg-gray-100 text-gray-600",
  paused: "bg-amber-100 text-amber-700",
  closed: "bg-red-100 text-red-700",
};

interface Props {
  job: Job;
  applications: Application[];
  departments: Department[];
  isAdmin: boolean;
}

export function JobDetailClient({ job, applications, departments, isAdmin }: Props) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const active = applications.filter((a) => a.stage !== "rejected");
  const rejected = applications.filter((a) => a.stage === "rejected");

  async function handleMove(appId: string, stage: ApplicationStage) {
    setMovingId(appId);
    try {
      const result = await updateApplicationStage(appId, stage);
      if (result.success) {
        toast.success(`Moved to ${STAGES.find((s) => s.value === stage)?.label}`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setMovingId(null);
    }
  }

  async function handleReject(appId: string) {
    const result = await rejectApplication(appId, rejectReason);
    if (result.success) {
      toast.success("Candidate rejected");
      setRejectingId(null);
      setRejectReason("");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  const stageObj = (stage: ApplicationStage) => STAGES.find((s) => s.value === stage)!;

  return (
    <div className="space-y-6">
      {/* Back + header */}
      <div>
        <Link href="/hire/jobs" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Jobs
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">{job.title}</h1>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[job.status]}`}>
                {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
              {job.department_name && <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" />{job.department_name}</span>}
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{job.location_type.replace("_", "-")}{job.location ? ` · ${job.location}` : ""}</span>
              <span className="flex items-center gap-1"><Users className="h-3 w-3" />{job.application_count} applicants</span>
            </div>
          </div>
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit Job
            </Button>
          )}
        </div>
      </div>

      {/* Description */}
      <div className="rounded-xl border border-indigo-100 bg-white p-5 dark:border-indigo-900/40 dark:bg-[#150e2b]">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Description</p>
        <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">{job.description}</pre>
      </div>

      {/* Applications */}
      <div>
        <h2 className="font-semibold mb-3">
          Applications <span className="text-muted-foreground font-normal">({active.length} active{rejected.length > 0 ? ` · ${rejected.length} rejected` : ""})</span>
        </h2>

        {applications.length === 0 ? (
          <div className="rounded-xl border border-dashed border-indigo-200 dark:border-indigo-900/40 p-10 text-center">
            <p className="text-sm text-muted-foreground">No applications yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {active.map((app) => {
              const s = stageObj(app.stage);
              return (
                <div key={app.id} className="rounded-xl border border-indigo-100 bg-white p-4 dark:border-indigo-900/40 dark:bg-[#150e2b]">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium text-sm">{app.candidate_name}</p>
                      <p className="text-xs text-muted-foreground">{app.candidate_email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.color}`}>{s.label}</span>

                      {isAdmin && (
                        <div className="flex items-center gap-1">
                          {/* Move forward */}
                          {app.stage !== "hired" && app.stage !== "rejected" && (
                            <select
                              className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                              value={app.stage}
                              disabled={movingId === app.id}
                              onChange={(e) => handleMove(app.id, e.target.value as ApplicationStage)}
                            >
                              {STAGES.filter((s) => s.value !== "rejected").map((s) => (
                                <option key={s.value} value={s.value}>{s.label}</option>
                              ))}
                            </select>
                          )}
                          {/* Reject */}
                          {app.stage !== "hired" && app.stage !== "rejected" && (
                            <button
                              className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400"
                              onClick={() => setRejectingId(app.id)}
                            >
                              Reject
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {app.cover_note && (
                    <p className="mt-2 text-xs text-muted-foreground border-t border-border pt-2">{app.cover_note}</p>
                  )}

                  {/* Reject inline form */}
                  {rejectingId === app.id && (
                    <div className="mt-3 border-t border-border pt-3 space-y-2">
                      <input
                        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                        placeholder="Rejection reason (optional)"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" variant="destructive" onClick={() => handleReject(app.id)}>Confirm Reject</Button>
                        <Button size="sm" variant="outline" onClick={() => setRejectingId(null)}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Rejected section */}
            {rejected.length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  {rejected.length} rejected candidate{rejected.length > 1 ? "s" : ""}
                </summary>
                <div className="mt-2 space-y-2">
                  {rejected.map((app) => (
                    <div key={app.id} className="rounded-lg border border-border p-3 opacity-60">
                      <p className="text-sm font-medium">{app.candidate_name}</p>
                      <p className="text-xs text-muted-foreground">{app.candidate_email}</p>
                      {app.rejection_reason && <p className="text-xs text-muted-foreground mt-1">Reason: {app.rejection_reason}</p>}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </div>

      {editOpen && (
        <JobDialog
          open={editOpen}
          onClose={() => { setEditOpen(false); router.refresh(); }}
          departments={departments}
          existing={job}
        />
      )}
    </div>
  );
}
