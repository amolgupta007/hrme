"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CvUploadDialog } from "./cv-upload-dialog";
import { CriteriaConfigDialog } from "./criteria-config-dialog";
import { ScoreChip } from "./score-chip";
import { CoverageView } from "./coverage-view";
import { ScreeningAuditView } from "./screening-audit-view";
import { RejectDialog } from "./reject-dialog";
import { runScreening, reparseCv } from "@/actions/screening";
import { updateApplicationStage, rejectApplication } from "@/actions/hire";
import { bulkUpdateApplicationStage } from "@/actions/hire";

type RosterItem = {
  application_id: string;
  candidate_id: string;
  name: string;
  parse_status: string | null;
  scored: boolean;
};

type TierFilter = "all" | "strong" | "possible" | "weak";

export function ScreeningClient({
  jobId,
  jobTitle,
  results,
  roster,
}: {
  jobId: string;
  jobTitle: string;
  results: any[];
  roster: RosterItem[];
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAudit, setShowAudit] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tier, setTier] = useState<TierFilter>("all");
  const [rejectIds, setRejectIds] = useState<string[] | null>(null);
  const [pending, start] = useTransition();

  // Intake = uploaded CVs not yet scored (parsing / ready / failed).
  const intake = roster.filter((r) => !r.scored);
  const stillParsing = intake.some((r) => r.parse_status === null);

  // Self-terminating poll: while any CV is still parsing, refresh server data
  // every 4s until all have a terminal parse_status.
  useEffect(() => {
    if (!stillParsing) return;
    const t = setTimeout(() => router.refresh(), 4000);
    return () => clearTimeout(t);
  }, [stillParsing, router, roster]);

  const filtered = useMemo(
    () => (tier === "all" ? results : results.filter((r) => r.tier === tier)),
    [results, tier],
  );

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((r) => selected.has(r.application_id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      if (filtered.every((r) => prev.has(r.application_id))) return new Set();
      return new Set(filtered.map((r) => r.application_id));
    });
  }

  function run() {
    start(async () => {
      const res = await runScreening(jobId);
      if (res.success) {
        toast.success(`Scored ${res.data.scored}, skipped ${res.data.skipped}`);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function advance(ids: string[]) {
    start(async () => {
      const res =
        ids.length === 1
          ? await updateApplicationStage(ids[0], "screening")
          : await bulkUpdateApplicationStage(ids, "screening");
      if ((res as any).success !== false) {
        toast.success(`Advanced ${ids.length} to Screening`);
        setSelected(new Set());
        router.refresh();
      } else toast.error((res as any).error ?? "Failed to advance");
    });
  }

  function confirmReject(reason: string) {
    const ids = rejectIds ?? [];
    start(async () => {
      const results = await Promise.all(ids.map((id) => rejectApplication(id, reason)));
      const failed = results.filter((r) => (r as any).success === false).length;
      if (failed === 0) toast.success(`Rejected ${ids.length}`);
      else toast.error(`${failed} of ${ids.length} failed`);
      setRejectIds(null);
      setSelected(new Set());
      router.refresh();
    });
  }

  function reparse(candidateId: string) {
    start(async () => {
      await reparseCv(candidateId);
      toast.success("Re-parsing CV…");
      setTimeout(() => router.refresh(), 1500);
    });
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload CVs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <CvUploadDialog jobId={jobId} onUploaded={() => router.refresh()} />
          {intake.length > 0 ? (
            <ul className="divide-y rounded-md border">
              {intake.map((r) => (
                <li key={r.application_id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="font-medium">{r.name}</span>
                  <div className="flex items-center gap-2">
                    <IntakeStatus status={r.parse_status} />
                    {r.parse_status === "needs_review" || r.parse_status === "unsupported" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => reparse(r.candidate_id)}
                        disabled={pending}
                      >
                        Re-parse
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      <CriteriaConfigDialog jobId={jobId} />

      {/* Results */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Ranked candidates</CardTitle>
          <div className="flex flex-wrap items-center gap-1">
            {(["all", "strong", "possible", "weak"] as TierFilter[]).map((t) => (
              <Button
                key={t}
                variant={tier === t ? "default" : "ghost"}
                size="sm"
                className={tier === t ? "bg-indigo-600 hover:bg-indigo-700 text-white" : ""}
                onClick={() => setTier(t)}
              >
                {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              {results.length === 0
                ? "No results yet. Upload CVs, save criteria, then Run screening."
                : "No candidates in this tier."}
            </p>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b px-4 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allFilteredSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-input accent-indigo-600"
                />
                <span className="text-xs text-muted-foreground">
                  {selected.size > 0 ? `${selected.size} selected` : `Select all (${filtered.length})`}
                </span>
              </div>
              <ul className="divide-y">
                {filtered.map((r) => (
                  <li key={r.application_id} className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <input
                          type="checkbox"
                          aria-label={`Select ${r.candidates?.name ?? "candidate"}`}
                          checked={selected.has(r.application_id)}
                          onChange={() => toggle(r.application_id)}
                          className="h-4 w-4 shrink-0 rounded border-input accent-indigo-600"
                        />
                        <ScoreChip score={r.score} tier={r.tier} />
                        <span className="shrink-0 font-medium">{r.candidates?.name ?? "Candidate"}</span>
                        <span className="truncate text-sm text-muted-foreground">{r.rationale}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpanded(expanded === r.application_id ? null : r.application_id)}
                        >
                          {expanded === r.application_id ? "Hide" : "Details"}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => advance([r.application_id])}
                          disabled={pending}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                          Advance
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setRejectIds([r.application_id])}
                          disabled={pending}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                    {expanded === r.application_id ? (
                      <div className="mt-3 pl-7">
                        <CoverageView coverage={r.coverage ?? []} />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      {showAudit ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Screening activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ScreeningAuditView jobId={jobId} />
          </CardContent>
        </Card>
      ) : null}

      {/* Sticky bulk-action bar */}
      {selected.size > 0 ? (
        <div className="sticky bottom-4 z-10 mx-auto flex w-fit max-w-[calc(100vw-2rem)] flex-wrap items-center justify-center gap-3 rounded-2xl border bg-background px-4 py-2 shadow-lg">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Button
            size="sm"
            onClick={() => advance(Array.from(selected))}
            disabled={pending}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            Advance
          </Button>
          <Button variant="outline" size="sm" onClick={() => setRejectIds(Array.from(selected))} disabled={pending}>
            Reject
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} disabled={pending}>
            Clear
          </Button>
        </div>
      ) : null}

      <RejectDialog
        open={rejectIds !== null}
        onOpenChange={(o) => !o && setRejectIds(null)}
        count={rejectIds?.length ?? 0}
        pending={pending}
        onConfirm={confirmReject}
      />
    </div>
  );
}

function IntakeStatus({ status }: { status: string | null }) {
  if (status === null)
    return (
      <Badge variant="secondary" className="animate-pulse">
        Parsing…
      </Badge>
    );
  if (status === "ok") return <Badge variant="success">Ready</Badge>;
  if (status === "needs_review") return <Badge variant="outline" className="border-amber-300 text-amber-700">Needs review</Badge>;
  return <Badge variant="destructive">Unsupported</Badge>;
}
