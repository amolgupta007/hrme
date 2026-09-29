"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  excuseLateDay,
  listLatePenalties,
  waiveLatePenalty,
  type LatePenaltyEventView,
  type LatePenaltyRow,
  type LatePolicy,
} from "@/actions/late-policy";
import { describeLadder } from "@jambahr/shared/attendance/late-ladder";

const istMonth = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 7);
const LEAVE_LABELS: Record<string, string> = { casual: "casual leave", paid: "earned leave", sick: "sick leave", custom: "leave" };

const fmtDay = (d: string) =>
  new Date(`${d}T00:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }) : "—";

function deductionLabel(e: LatePenaltyEventView) {
  const parts = [e.clDays > 0 ? `${e.clDays} leave` : "", e.lopDays > 0 ? `${e.lopDays} LOP` : ""].filter(Boolean);
  return parts.join(" + ") || "Nothing (no balance)";
}

const STATUS: Record<LatePenaltyEventView["status"], { label: string; className: string }> = {
  applied: { label: "Applied", className: "border-transparent bg-destructive/10 text-destructive" },
  reversed: { label: "Reversed", className: "border-transparent bg-muted text-muted-foreground" },
  waived: { label: "Waived", className: "border-transparent bg-success/10 text-success" },
  needs_review: { label: "Needs review", className: "border-transparent bg-warning/15 text-warning-foreground dark:text-warning" },
};

export function LatePenaltiesTab() {
  const [month, setMonth] = React.useState(istMonth);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [policy, setPolicy] = React.useState<LatePolicy | null>(null);
  const [rows, setRows] = React.useState<LatePenaltyRow[]>([]);
  const [open, setOpen] = React.useState<string | null>(null);
  const [waiving, setWaiving] = React.useState<LatePenaltyEventView | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const res = await listLatePenalties(month);
    setLoading(false);
    if (!res.success) return setError(res.error);
    setError(null);
    setPolicy(res.data.policy);
    setRows(res.data.rows);
  }, [month]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const ladder = policy?.consequence === "leave_deduction";
  const summary = !policy
    ? null
    : ladder
      ? describeLadder({
          warningAt: policy.ladder_warning_at,
          deductAt: policy.ladder_deduct_at,
          deductDays: Number(policy.ladder_deduct_days),
          repeat: policy.ladder_repeat,
          lopFallback: policy.ladder_lop_fallback,
          leaveLabel: LEAVE_LABELS[policy.ladder_leave_type] ?? "leave",
        })
      : `Flagged at ${policy.threshold_days} late arrivals a month`;
  const reviewCount = rows.reduce((n, r) => n + r.events.filter((e) => e.status === "needs_review").length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Late arrivals &amp; penalties</h2>
          <p className="text-sm text-muted-foreground">
            {summary ?? "No late policy yet."}{" "}
            <Link href="/dashboard/settings" className="font-medium text-primary underline-offset-2 hover:underline">
              Edit rules
            </Link>
          </p>
        </div>
        <label className="text-sm">
          <span className="sr-only">Month</span>
          <Input type="month" value={month} max={istMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} className="w-44" />
        </label>
      </div>

      {policy && !policy.enabled && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          The late policy is switched off, so nothing new is counted or charged. Existing records are shown below.
        </div>
      )}
      {reviewCount > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {reviewCount} {reviewCount === 1 ? "penalty needs" : "penalties need"} review: the late count changed (or a
            new penalty arrived) after this month&apos;s payroll was paid, so the loss of pay couldn&apos;t be adjusted
            automatically. Waive it here and correct the payout manually if needed.
          </span>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : error ? (
          <div className="p-10 text-center text-sm">
            <p className="font-medium">Couldn&apos;t load late arrivals</p>
            <p className="mt-1 text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center p-10 text-center text-sm text-muted-foreground">
            <ShieldCheck className="mb-2 h-8 w-8 text-success" />
            No late arrivals recorded this month.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => {
              const expanded = open === r.employeeId;
              const warning = r.events.find((e) => e.kind === "warning");
              const deductions = r.events.filter((e) => e.kind === "deduction");
              return (
                <li key={r.employeeId}>
                  <button
                    onClick={() => setOpen(expanded ? null : r.employeeId)}
                    aria-expanded={expanded}
                    className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-muted/40"
                  >
                    {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.name}</span>
                      <span className="text-xs text-muted-foreground">{r.department ?? "No department"}</span>
                    </span>
                    <span className="text-sm tabular-nums">
                      <strong>{r.lateCount}</strong> late{r.lateCount === 1 ? "" : "s"}
                    </span>
                    {ladder && (
                      <span className="flex flex-wrap gap-1.5">
                        {warning && <Badge className="border-transparent bg-warning/15 text-warning-foreground dark:text-warning">Warned</Badge>}
                        {deductions.map((d) => (
                          <Badge key={d.id} className={STATUS[d.status].className}>
                            {deductionLabel(d)} · {STATUS[d.status].label}
                          </Badge>
                        ))}
                      </span>
                    )}
                  </button>

                  {expanded && (
                    <div className="space-y-4 border-t border-border bg-muted/20 px-4 py-4 sm:pl-12">
                      <div>
                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Late days</p>
                        <ul className="space-y-1.5">
                          {r.days.map((d) => (
                            <LateDayRow key={d.recordId} day={d} onChanged={load} />
                          ))}
                        </ul>
                      </div>
                      {r.events.length > 0 && (
                        <div>
                          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Actions taken</p>
                          <ul className="space-y-1.5 text-sm">
                            {r.events.map((e) => (
                              <li key={e.id} className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">
                                  {e.kind === "warning" ? "Formal warning" : `Deduction ${e.occurrenceNo}: ${deductionLabel(e)}`}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  at late #{e.lateCount} · {fmtDay(e.createdAt.slice(0, 10))}
                                  {e.emailStatus === "skipped_no_email" && " · no email on file"}
                                  {e.emailStatus === "failed" && " · email failed"}
                                </span>
                                {e.kind === "deduction" && <Badge className={STATUS[e.status].className}>{STATUS[e.status].label}</Badge>}
                                {e.statusReason && e.status !== "applied" && (
                                  <span className="text-xs text-muted-foreground">“{e.statusReason}”</span>
                                )}
                                {e.kind === "deduction" && (e.status === "applied" || e.status === "needs_review") && (
                                  <Button size="sm" variant="outline" className="h-7" onClick={() => setWaiving(e)}>
                                    Waive
                                  </Button>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <WaiveDialog event={waiving} onClose={() => setWaiving(null)} onDone={load} />
    </div>
  );
}

function LateDayRow({ day, onChanged }: { day: LatePenaltyRow["days"][number]; onChanged: () => void }) {
  const [editing, setEditing] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit(excused: boolean) {
    setBusy(true);
    const res = await excuseLateDay({ recordId: day.recordId, excused, reason });
    setBusy(false);
    if (!res.success) return void toast.error(res.error);
    toast.success(excused ? `Excused — ${res.data.lateCount} late arrivals now count` : "Excuse removed");
    setEditing(false);
    setReason("");
    onChanged();
  }

  return (
    <li className="rounded-md bg-background px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="w-28 font-medium">{fmtDay(day.date)}</span>
        <span className="text-muted-foreground">
          in {fmtTime(day.clockInAt)} · {day.lateMinutes ?? 0} min late
        </span>
        {day.excused ? (
          <Badge className="border-transparent bg-success/10 text-success">Excused</Badge>
        ) : !day.counted ? (
          <span className="text-xs text-muted-foreground" title="Week-off, holiday, approved leave or before the policy went live">
            Not counted
          </span>
        ) : null}
        <span className="ml-auto">
          {day.excused ? (
            <Button size="sm" variant="ghost" className="h-7" disabled={busy} onClick={() => submit(false)}>
              Undo excuse
            </Button>
          ) : (
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditing((v) => !v)}>
              Excuse
            </Button>
          )}
        </span>
      </div>
      {day.excused && day.excuseReason && <p className="mt-1 text-xs text-muted-foreground">“{day.excuseReason}”</p>}
      {editing && !day.excused && (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (e.g. approved client visit)"
            className="h-8"
          />
          <Button size="sm" className="h-8" disabled={busy || !reason.trim()} onClick={() => submit(true)}>
            {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Excuse day
          </Button>
        </div>
      )}
    </li>
  );
}

function WaiveDialog({
  event,
  onClose,
  onDone,
}: {
  event: LatePenaltyEventView | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => setReason(""), [event?.id]);

  async function submit() {
    if (!event) return;
    setBusy(true);
    const res = await waiveLatePenalty({ eventId: event.id, reason });
    setBusy(false);
    if (!res.success) return void toast.error(res.error);
    toast.success("Penalty waived — the employee has been notified");
    onClose();
    onDone();
  }

  return (
    <Dialog open={!!event} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>Waive this penalty?</DialogTitle>
          <DialogDescription>
            {event && (
              <>
                {deductionLabel(event)}.{" "}
                {event.clDays > 0 && "The leave is credited back. "}
                {event.lopDays > 0 &&
                  (event.status === "needs_review"
                    ? "Payroll for this month is already paid, so correct the payout manually. "
                    : "The loss of pay is removed from this month's payroll. ")}
                The employee and their manager are emailed a correction. This is recorded with your name and reason.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" rows={3} />
        <DialogFooter className={cn("gap-2")}>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !reason.trim()}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Waive penalty
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
