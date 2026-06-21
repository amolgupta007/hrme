"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CvUploadDialog } from "./cv-upload-dialog";
import { CriteriaConfigDialog } from "./criteria-config-dialog";
import { ScoreChip } from "./score-chip";
import { CoverageView } from "./coverage-view";
import { ScreeningAuditView } from "./screening-audit-view";
import { runScreening } from "@/actions/screening";
import { updateApplicationStage, rejectApplication } from "@/actions/hire";

export function ScreeningClient({
  jobId,
  jobTitle,
  results,
}: {
  jobId: string;
  jobTitle: string;
  results: any[];
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAudit, setShowAudit] = useState(false);
  const [pending, start] = useTransition();

  function run() {
    start(async () => {
      const res = await runScreening(jobId);
      if (res.success) {
        toast.success(`Scored ${res.data.scored}, skipped ${res.data.skipped}`);
        location.reload();
      } else toast.error(res.error);
    });
  }

  function advance(applicationId: string) {
    start(async () => {
      const res = await updateApplicationStage(applicationId, "screening");
      if ((res as any).success !== false) {
        toast.success("Advanced to Screening");
        location.reload();
      } else toast.error((res as any).error ?? "Failed");
    });
  }

  function reject(applicationId: string) {
    const reason = window.prompt("Internal rejection reason (never emailed to the candidate):");
    if (!reason) return;
    start(async () => {
      const res = await rejectApplication(applicationId, reason);
      if ((res as any).success !== false) {
        toast.success("Rejected");
        location.reload();
      } else toast.error((res as any).error ?? "Failed");
    });
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Screening — {jobTitle}</h1>
          <p className="text-sm text-muted-foreground">Upload CVs, set criteria, then rank the shortlist.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowAudit((v) => !v)}>
            {showAudit ? "Hide audit" : "Audit log"}
          </Button>
          <Button onClick={run} disabled={pending} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            {pending ? "Screening…" : "Run screening"}
          </Button>
        </div>
      </div>

      <CvUploadDialog jobId={jobId} />
      <CriteriaConfigDialog jobId={jobId} />

      <div className="divide-y rounded-lg border">
        {results.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            No results yet. Upload CVs, save criteria, then Run screening.
          </p>
        ) : (
          results.map((r) => (
            <div key={r.application_id} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <ScoreChip score={r.score} tier={r.tier} />
                  <span className="font-medium">{r.candidates?.name ?? "Candidate"}</span>
                  <span className="text-sm text-muted-foreground">{r.rationale}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpanded(expanded === r.application_id ? null : r.application_id)}
                  >
                    {expanded === r.application_id ? "Hide" : "Details"}
                  </Button>
                  <Button size="sm" onClick={() => advance(r.application_id)} disabled={pending} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                    Advance
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => reject(r.application_id)} disabled={pending}>
                    Reject
                  </Button>
                </div>
              </div>
              {expanded === r.application_id ? (
                <div className="mt-3 pl-1">
                  <CoverageView coverage={r.coverage ?? []} />
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>

      {showAudit ? <ScreeningAuditView jobId={jobId} /> : null}
    </div>
  );
}
