"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { getApplicationTransitions, type StageTransition, type ApplicationStage, type Application } from "@/actions/hire";
import { ApplicationTimeline } from "./application-timeline";

const STAGE_LABEL: Record<ApplicationStage, string> = {
  applied: "Applied",
  screening: "Screening",
  shortlisted: "Shortlisted",
  interview_1: "Interview 1",
  interview_2: "Interview 2",
  final_round: "Final Round",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
};

const STAGE_CHIP: Record<ApplicationStage, string> = {
  applied: "bg-gray-100 text-gray-700",
  screening: "bg-blue-100 text-blue-700",
  shortlisted: "bg-amber-100 text-amber-700",
  interview_1: "bg-violet-100 text-violet-700",
  interview_2: "bg-indigo-100 text-indigo-700",
  final_round: "bg-orange-100 text-orange-700",
  offer: "bg-emerald-100 text-emerald-700",
  hired: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

interface Props {
  application: Application | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ApplicationDetailDialog({ application, open, onOpenChange }: Props) {
  const [transitions, setTransitions] = useState<StageTransition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !application) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getApplicationTransitions(application.id).then((result) => {
      if (cancelled) return;
      if (result.success) {
        setTransitions(result.data);
      } else {
        setError(result.error);
        setTransitions([]);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, application]);

  if (!application) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {application.candidate_name}
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STAGE_CHIP[application.stage]}`}>
              {STAGE_LABEL[application.stage]}
            </span>
          </DialogTitle>
          <DialogDescription className="space-y-0.5">
            <span className="block">{application.job_title}</span>
            <span className="block text-xs">{application.candidate_email}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          <h3 className="text-sm font-semibold mb-3">Activity</h3>
          {loading ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Loading…</div>
          ) : error ? (
            <div className="text-sm text-red-600 py-6 text-center">{error}</div>
          ) : (
            <ApplicationTimeline transitions={transitions} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
