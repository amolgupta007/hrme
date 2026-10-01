"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Home, Plus, X, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { cancelWfh, decideWfh, requestWfh, type MyWfh, type WfhApprovals, type WfhRequestRow } from "@/actions/wfh";
import { planWfhRequest } from "@jambahr/shared/attendance/wfh";

const istToday = () => new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

function fmt(date: string) {
  return new Date(`${date}T00:00:00+05:30`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  });
}

const STATUS_LABEL: Record<WfhRequestRow["status"], string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Not approved",
  cancelled: "Cancelled",
};

const STATUS_STYLE: Record<WfhRequestRow["status"], string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  cancelled: "bg-muted text-muted-foreground",
};

function StatusChip({ status }: { status: WfhRequestRow["status"] }) {
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", STATUS_STYLE[status])}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function OverQuotaTag() {
  return (
    <span
      className="inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
      title="Beyond the monthly allowance — needs an admin's approval"
    >
      Extra · admin approval
    </span>
  );
}

export function WfhPanel({ my, approvals }: { my: MyWfh | null; approvals: WfhApprovals | null }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const enabled = !!my?.policy.enabled;
  const hasApprovals = !!approvals && (approvals.pending.length > 0 || approvals.recent.length > 0);
  if (!enabled && !hasApprovals) return null;

  const isRemote = my?.arrangement === "remote";
  const allowance = my?.policy.monthlyAllowance ?? 0;
  const today = istToday();
  const myUpcoming = (my?.requests ?? []).filter((r) => r.date >= today || r.status === "pending");

  return (
    <div className="space-y-4">
      {enabled && my && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                <Home className="h-4 w-4" />
              </span>
              <div>
                <p className="font-medium">Work from home</p>
                {isRemote ? (
                  <p className="text-sm text-muted-foreground">
                    You work remotely — no request needed. Just clock in as usual.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    <strong className="text-foreground">{Math.min(my.usedThisMonth, allowance)} of {allowance}</strong>{" "}
                    used this month. Needs your reporting manager&apos;s approval; you still clock in on the day.
                  </p>
                )}
              </div>
            </div>
            {!isRemote && (
              <Button onClick={() => setOpen(true)} variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                Request WFH
              </Button>
            )}
          </div>

          {myUpcoming.length > 0 && (
            <ul className="mt-4 divide-y divide-border border-t border-border">
              {myUpcoming.map((r) => (
                <MyRow key={r.id} row={r} onChanged={() => router.refresh()} />
              ))}
            </ul>
          )}
        </div>
      )}

      {hasApprovals && <ApprovalsCard approvals={approvals!} onChanged={() => router.refresh()} />}

      {enabled && my && !isRemote && (
        <RequestDialog
          open={open}
          onOpenChange={setOpen}
          my={my}
          onDone={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function MyRow({ row, onChanged }: { row: WfhRequestRow; onChanged: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const canCancel = (row.status === "pending" || row.status === "approved") && row.date >= istToday();
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{fmt(row.date)}</span>
        <StatusChip status={row.status} />
        {row.over_quota && row.status === "pending" && <OverQuotaTag />}
        {row.status === "rejected" && row.decision_note && (
          <span className="text-xs text-muted-foreground">— {row.decision_note}</span>
        )}
      </div>
      {canCancel && (
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const res = await cancelWfh(row.id);
            setBusy(false);
            if (!res.success) return void toast.error(res.error);
            toast.success("Request cancelled");
            onChanged();
          }}
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50"
        >
          Cancel
        </button>
      )}
    </li>
  );
}

function RequestDialog({
  open,
  onOpenChange,
  my,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  my: MyWfh;
  onDone: () => void;
}) {
  const today = istToday();
  const [day, setDay] = React.useState(today);
  const [dates, setDates] = React.useState<string[]>([]);
  const [reason, setReason] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setDay(today);
      setDates([]);
      setReason("");
    }
  }, [open, today]);

  const activeDates = new Set(
    my.requests.filter((r) => r.status === "pending" || r.status === "approved").map((r) => r.date),
  );
  const plan =
    dates.length > 0
      ? planWfhRequest({
          dates,
          today,
          arrangement: my.arrangement,
          allowance: my.policy.monthlyAllowance,
          activeDates,
          leaveDates: new Set(),
        })
      : null;
  const overQuota = plan?.ok ? plan.rows.filter((r) => r.overQuota).map((r) => r.date) : [];

  function addDay() {
    if (!day || dates.includes(day)) return;
    setDates([...dates, day].sort());
  }

  async function submit() {
    setSaving(true);
    const res = await requestWfh({ dates, reason: reason.trim() || undefined });
    setSaving(false);
    if (!res.success) return void toast.error(res.error);
    toast.success(
      res.data.overQuota > 0
        ? `Requested — ${res.data.overQuota} day${res.data.overQuota > 1 ? "s need" : " needs"} admin approval`
        : "Requested — your manager will be notified",
    );
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request work from home</DialogTitle>
          <DialogDescription>
            Add the day(s) you want to work from home. You can include today. You&apos;ll still clock in on JambaHR.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              type="date"
              min={today}
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
              aria-label="Day"
            />
            <Button type="button" variant="outline" onClick={addDay} disabled={!day || day < today}>
              Add day
            </Button>
          </div>

          {dates.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {dates.map((d) => (
                <span
                  key={d}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                    overQuota.includes(d)
                      ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                      : "bg-muted",
                  )}
                >
                  {fmt(d)}
                  <button aria-label={`Remove ${d}`} onClick={() => setDates(dates.filter((x) => x !== d))}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {plan && !plan.ok && <p className="text-sm text-destructive">{plan.error}</p>}
          {overQuota.length > 0 && (
            <p className="rounded-md bg-violet-50 px-3 py-2 text-xs text-violet-800 dark:bg-violet-950/40 dark:text-violet-200">
              You get {my.policy.monthlyAllowance} work-from-home days a month. The highlighted day
              {overQuota.length > 1 ? "s go" : " goes"} beyond that, so an admin needs to approve
              {overQuota.length > 1 ? " them" : " it"}.
            </p>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="wfh-reason">
              Reason <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id="wfh-reason"
              rows={2}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || dates.length === 0 || (plan !== null && !plan.ok)}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApprovalsCard({ approvals, onChanged }: { approvals: WfhApprovals; onChanged: () => void }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="font-medium">Work-from-home approvals</p>
      {approvals.pending.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">Nothing waiting for you.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border border-t border-border">
          {approvals.pending.map((r) => (
            <ApprovalRow key={r.id} row={r} onChanged={onChanged} />
          ))}
        </ul>
      )}
      {approvals.recent.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Recently decided ({approvals.recent.length})
          </summary>
          <ul className="mt-2 space-y-1.5">
            {approvals.recent.slice(0, 20).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-medium">{r.employee_name}</span>
                <span className="text-muted-foreground">{fmt(r.date)}</span>
                <StatusChip status={r.status} />
                {r.decided_by_name && <span className="text-muted-foreground">by {r.decided_by_name}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function ApprovalRow({ row, onChanged }: { row: WfhRequestRow; onChanged: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [rejecting, setRejecting] = React.useState(false);
  const [note, setNote] = React.useState("");

  async function decide(approve: boolean) {
    setBusy(true);
    const res = await decideWfh({ ids: [row.id], approve, note: approve ? undefined : note });
    setBusy(false);
    if (!res.success) return void toast.error(res.error);
    toast.success(approve ? "Approved" : "Marked not approved");
    onChanged();
  }

  return (
    <li className="py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{row.employee_name}</span>
          <span className="text-muted-foreground">{fmt(row.date)}</span>
          {row.over_quota && <OverQuotaTag />}
          {row.reason && <span className="text-xs text-muted-foreground">“{row.reason}”</span>}
        </div>
        {!rejecting && (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => decide(true)} disabled={busy}>
              <Check className="mr-1 h-3.5 w-3.5" />
              Approve
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRejecting(true)} disabled={busy}>
              Not approve
            </Button>
          </div>
        )}
      </div>
      {rejecting && (
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            autoFocus
            placeholder="Reason (shown to the employee)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="h-9 min-w-[220px] flex-1 rounded-md border border-input bg-background px-3 text-sm"
          />
          <Button size="sm" variant="destructive" onClick={() => decide(false)} disabled={busy || !note.trim()}>
            Confirm
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setRejecting(false)} disabled={busy}>
            Back
          </Button>
        </div>
      )}
    </li>
  );
}
