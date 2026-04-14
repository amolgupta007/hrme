"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, MapPin, Briefcase, Users, MoreHorizontal, Pencil, Trash2, Play, Pause, Eye, Linkedin, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JobDialog } from "./job-dialog";
import { updateJobStatus, deleteJob } from "@/actions/hire";
import type { Job, JobStatus } from "@/actions/hire";
import type { Department } from "@/types";
import Link from "next/link";

const STATUS_TABS: { label: string; value: JobStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Draft", value: "draft" },
  { label: "Paused", value: "paused" },
  { label: "Closed", value: "closed" },
];

const STATUS_COLORS: Record<JobStatus, string> = {
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  draft: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  paused: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  closed: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
};

const EMPLOYMENT_LABELS: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  intern: "Intern",
};

const LOCATION_LABELS: Record<string, string> = {
  on_site: "On-site",
  remote: "Remote",
  hybrid: "Hybrid",
};

interface Props {
  jobs: Job[];
  departments: Department[];
  isAdmin: boolean;
  orgSlug: string;
}

export function JobsClient({ jobs, departments, isAdmin, orgSlug }: Props) {
  function linkedInShareUrl(jobTitle: string) {
    const careersUrl = `https://jambahr.com/careers/${orgSlug}`;
    return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(careersUrl)}`;
  }
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<JobStatus | "all">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<{ jobId: string; action: string } | null>(null);
  useEffect(() => {
    if (!openMenuId) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Element;
      if (!target.closest("[data-job-dropdown]")) {
        setOpenMenuId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openMenuId]);

  const filtered = activeTab === "all" ? jobs : jobs.filter((j) => j.status === activeTab);

  async function handleStatusChange(id: string, status: JobStatus) {
    setPendingAction({ jobId: id, action: status });
    const result = await updateJobStatus(id, status);
    setPendingAction(null);
    if (result.success) {
      toast.success(`Job marked as ${status}`);
      router.refresh();
    } else {
      toast.error(result.error);
    }
    setOpenMenuId(null);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this job? All applications will also be deleted.")) return;
    setPendingAction({ jobId: id, action: "delete" });
    const result = await deleteJob(id);
    setPendingAction(null);
    if (result.success) {
      toast.success("Job deleted");
      router.refresh();
    } else {
      toast.error(result.error);
    }
    setOpenMenuId(null);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Jobs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {jobs.length} total · {jobs.filter((j) => j.status === "active").length} active
          </p>
        </div>
        {isAdmin && (
          <Button
            onClick={() => { setEditingJob(null); setDialogOpen(true); }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            New Job
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-indigo-100 dark:border-indigo-900/40">
        {STATUS_TABS.map((tab) => {
          const count = tab.value === "all" ? jobs.length : jobs.filter((j) => j.status === tab.value).length;
          return (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.value
                  ? "border-indigo-600 text-indigo-700 dark:text-indigo-300"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Jobs list */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-indigo-200 dark:border-indigo-900/40 p-12 text-center">
          <Briefcase className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">No jobs here</p>
          <p className="text-xs text-muted-foreground mt-1">
            {isAdmin ? 'Click "New Job" to create your first opening.' : "No openings in this category yet."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((job) => (
            <div
              key={job.id}
              className="relative rounded-xl border border-indigo-100 bg-white p-5 dark:border-indigo-900/40 dark:bg-[#150e2b]"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/hire/jobs/${job.id}`}
                      className="font-semibold text-foreground hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                    >
                      {job.title}
                    </Link>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[job.status]}`}>
                      {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mt-2 flex-wrap text-xs text-muted-foreground">
                    {job.department_name && (
                      <span className="flex items-center gap-1">
                        <Briefcase className="h-3 w-3" />
                        {job.department_name}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {LOCATION_LABELS[job.location_type]}
                      {job.location ? ` · ${job.location}` : ""}
                    </span>
                    <span>{EMPLOYMENT_LABELS[job.employment_type]}</span>
                    {job.show_salary && job.salary_min && (
                      <span>
                        ₹{(job.salary_min / 100000).toFixed(1)}L
                        {job.salary_max ? ` – ₹${(job.salary_max / 100000).toFixed(1)}L` : "+"}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span className="font-medium text-foreground">{job.application_count}</span>
                  </div>

                  {isAdmin && (
                    <div className="relative" data-job-dropdown>
                      <button
                        onClick={() => setOpenMenuId(openMenuId === job.id ? null : job.id)}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted transition-colors"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>

                      {openMenuId === job.id && (
                        <div className="absolute right-0 top-8 z-10 w-44 rounded-lg border border-border bg-background shadow-lg py-1">
                          <Link
                            href={`/hire/jobs/${job.id}`}
                            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted w-full text-left"
                            onClick={() => setOpenMenuId(null)}
                          >
                            <Eye className="h-3.5 w-3.5" /> View
                          </Link>
                          {orgSlug && job.status === "active" && (
                            <a
                              href={linkedInShareUrl(job.title)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted w-full text-left text-[#0A66C2]"
                              onClick={() => setOpenMenuId(null)}
                            >
                              <Linkedin className="h-3.5 w-3.5" /> Share on LinkedIn
                            </a>
                          )}
                          <button
                            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted w-full text-left"
                            onClick={() => { setEditingJob(job); setDialogOpen(true); setOpenMenuId(null); }}
                          >
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </button>
                          {job.status === "active" && (
                            <button
                              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted w-full text-left disabled:opacity-50"
                              disabled={pendingAction?.jobId === job.id}
                              onClick={() => handleStatusChange(job.id, "paused")}
                            >
                              {pendingAction?.jobId === job.id && pendingAction.action === "paused"
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <Pause className="h-3.5 w-3.5" />}
                              Pause
                            </button>
                          )}
                          {(job.status === "draft" || job.status === "paused") && (
                            <button
                              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted w-full text-left disabled:opacity-50"
                              disabled={pendingAction?.jobId === job.id}
                              onClick={() => handleStatusChange(job.id, "active")}
                            >
                              {pendingAction?.jobId === job.id && pendingAction.action === "active"
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <Play className="h-3.5 w-3.5" />}
                              Activate
                            </button>
                          )}
                          {job.status !== "closed" && (
                            <button
                              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted w-full text-left disabled:opacity-50"
                              disabled={pendingAction?.jobId === job.id}
                              onClick={() => handleStatusChange(job.id, "closed")}
                            >
                              {pendingAction?.jobId === job.id && pendingAction.action === "closed"
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <X className="h-3.5 w-3.5" />}
                              Close role
                            </button>
                          )}
                          <div className="my-1 border-t border-border" />
                          <button
                            className="flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-muted w-full text-left disabled:opacity-50"
                            disabled={pendingAction?.jobId === job.id}
                            onClick={() => handleDelete(job.id)}
                          >
                            {pendingAction?.jobId === job.id && pendingAction.action === "delete"
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Trash2 className="h-3.5 w-3.5" />}
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      {dialogOpen && (
        <JobDialog
          open={dialogOpen}
          onClose={() => { setDialogOpen(false); setEditingJob(null); router.refresh(); }}
          departments={departments}
          existing={editingJob}
        />
      )}
    </div>
  );
}
