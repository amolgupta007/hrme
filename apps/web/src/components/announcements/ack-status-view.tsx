"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  BellRing,
  CheckCircle2,
  Clock,
  Download,
  Loader2,
  Search,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatDate, formatDateTime, timeAgo } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { PersonAvatar } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MarkdownView } from "@/components/documents/markdown-view";
import {
  addLateJoiners,
  remindAnnouncementAck,
  type AckStatusEmployeeRow,
  type AnnouncementAckStatus,
} from "@/actions/announcements";
import { canRemind, type AckState } from "@/lib/announcements/ack-status";
import { buildAckCsv } from "@/lib/announcements/export";
import { categoryMeta } from "@/lib/announcements/categories";

type Filter = "pending" | "overdue" | "acknowledged" | "left";

const STATE_BADGE: Record<AckState, { label: string; className: string }> = {
  acknowledged: { label: "Acknowledged", className: "border-transparent bg-success/10 text-success" },
  pending: { label: "Pending", className: "border-transparent bg-warning/15 text-warning-foreground dark:text-warning" },
  overdue: { label: "Overdue", className: "border-transparent bg-destructive/10 text-destructive" },
  left: { label: "Left", className: "border-transparent bg-muted text-muted-foreground" },
};

export function AckStatusView({ status }: { status: AnnouncementAckStatus }) {
  const router = useRouter();
  const { announcement: a, totals, rows, late_joiners } = status;
  const cat = categoryMeta(a.category);
  const pct = totals.total > 0 ? Math.round((totals.acknowledged / totals.total) * 100) : 0;

  const [filter, setFilter] = React.useState<Filter>(totals.pending > 0 ? "pending" : "acknowledged");
  const [query, setQuery] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [showBody, setShowBody] = React.useState(false);

  const counts: Record<Filter, number> = {
    // "Pending" includes overdue — overdue is a sharper slice of it.
    pending: totals.pending,
    overdue: totals.overdue,
    acknowledged: totals.acknowledged,
    left: totals.left,
  };

  const q = query.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    const inFilter = filter === "pending" ? r.state === "pending" || r.state === "overdue" : r.state === filter;
    if (!inFilter) return false;
    if (!q) return true;
    return [r.name, r.email ?? "", r.department ?? ""].some((v) => v.toLowerCase().includes(q));
  });

  const remindable = rows.filter(
    (r) => (r.state === "pending" || r.state === "overdue") && canRemind(r.last_reminded_at)
  ).length;

  async function remind(employeeIds?: string[]) {
    const key = employeeIds ? employeeIds[0] : "all";
    setBusy(key);
    const res = await remindAnnouncementAck(a.id, employeeIds);
    setBusy(null);
    if (!res.success) return void toast.error(res.error);
    const { reminded, skippedCooldown } = res.data;
    if (reminded === 0) toast.info("Everyone pending was already reminded in the last 24 hours");
    else
      toast.success(
        `Reminded ${reminded} ${reminded === 1 ? "person" : "people"}` +
          (skippedCooldown ? ` · ${skippedCooldown} skipped (reminded <24h ago)` : "")
      );
    router.refresh();
  }

  async function addJoiners() {
    setBusy("joiners");
    const res = await addLateJoiners(a.id);
    setBusy(null);
    if (!res.success) return void toast.error(res.error);
    toast.success(`Added ${res.data.added} ${res.data.added === 1 ? "person" : "people"} — they've been notified`);
    router.refresh();
  }

  function exportCsv() {
    const csv = buildAckCsv(rows);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `acknowledgements-${a.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 40)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/announcements"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Announcements
        </Link>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge className={cat.chip}>{cat.label}</Badge>
              <Badge variant="outline" className="gap-1 font-medium">
                <Users className="h-3 w-3" /> {a.audience_label || "Everyone"}
              </Badge>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight">{a.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Posted {formatDate(a.created_at)}
              {a.ack_due_date && <> · Due {formatDate(a.ack_due_date)}</>}
              {a.content_version > 1 && <> · Version {a.content_version}</>}
              {" · "}
              <button
                onClick={() => setShowBody((s) => !s)}
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                {showBody ? "Hide message" : "Show message"}
              </button>
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" onClick={exportCsv}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
            <Button onClick={() => remind()} disabled={remindable === 0 || busy !== null}>
              {busy === "all" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BellRing className="mr-2 h-4 w-4" />}
              Remind pending{remindable > 0 ? ` (${remindable})` : ""}
            </Button>
          </div>
        </div>
        {showBody && (
          <div className="mt-4 rounded-lg border border-border bg-muted/20 p-4">
            <MarkdownView markdown={a.body} />
          </div>
        )}
      </div>

      {!a.ack_required && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          Acknowledgement is currently turned off for this announcement. Existing records are shown below.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="col-span-2 rounded-xl border border-border bg-card p-4">
          <div className="flex items-baseline justify-between">
            <p className="text-sm text-muted-foreground">Acknowledged</p>
            <p className="text-sm font-semibold tabular-nums">{pct}%</p>
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {totals.acknowledged}
            <span className="text-base font-medium text-muted-foreground"> / {totals.total}</span>
          </p>
          <Progress value={pct} className="mt-3" />
        </div>
        <StatTile
          label="Pending"
          value={totals.pending}
          icon={<Clock className="h-4 w-4" />}
          tone="text-warning-foreground dark:text-warning"
        />
        <StatTile
          label="Overdue"
          value={totals.overdue}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone={totals.overdue > 0 ? "text-destructive" : "text-muted-foreground"}
        />
      </div>

      {late_joiners.length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <UserPlus className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-medium">
                {late_joiners.length} {late_joiners.length === 1 ? "person has" : "people have"} joined the audience
                since this was published
              </p>
              <p className="text-xs text-muted-foreground">
                {late_joiners
                  .slice(0, 4)
                  .map((j) => j.name)
                  .join(", ")}
                {late_joiners.length > 4 && ` and ${late_joiners.length - 4} more`}. They aren&apos;t asked to
                acknowledge unless you add them.
              </p>
            </div>
          </div>
          <Button onClick={addJoiners} disabled={busy !== null} className="shrink-0">
            {busy === "joiners" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add them
          </Button>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-3 md:flex-row md:items-center md:justify-between">
          <div className="scroll-thin flex gap-1 overflow-x-auto" role="tablist">
            {(["pending", "overdue", "acknowledged", "left"] as Filter[]).map((f) =>
              f === "left" && counts.left === 0 ? null : (
                <button
                  key={f}
                  role="tab"
                  aria-selected={filter === f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    filter === f ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {STATE_BADGE[f].label}
                  <span className="rounded-full bg-background px-1.5 text-xs tabular-nums">{counts[f]}</span>
                </button>
              )
            )}
          </div>
          <div className="relative md:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email, department"
              className="h-9 pl-8"
              aria-label="Search employees"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-12 text-center text-sm text-muted-foreground">
            {filter === "pending" && !q ? (
              <>
                <CheckCircle2 className="mb-2 h-8 w-8 text-success" />
                Everyone has acknowledged.
              </>
            ) : (
              "No one here."
            )}
          </div>
        ) : (
          <>
            {/* Mobile: stacked rows */}
            <ul className="divide-y divide-border md:hidden">
              {filtered.map((r) => (
                <li key={r.employee_id} className="flex items-center gap-3 p-3">
                  <PersonAvatar name={r.name} src={r.avatar_url} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.department ?? "No department"} · {describeWhen(r)}
                    </p>
                  </div>
                  <RowAction row={r} busy={busy} onRemind={remind} />
                </li>
              ))}
            </ul>

            {/* Desktop: table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>{filter === "acknowledged" ? "Acknowledged" : "Last reminded"}</TableHead>
                    <TableHead className="w-32 text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.employee_id}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <PersonAvatar name={r.name} src={r.avatar_url} />
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {r.name}
                              {r.added_reason === "late_add" && (
                                <span className="ml-1.5 text-xs font-normal text-muted-foreground">(added later)</span>
                              )}
                            </p>
                            {r.email && <p className="truncate text-xs text-muted-foreground">{r.email}</p>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.department ?? "—"}</TableCell>
                      <TableCell>
                        <Badge className={STATE_BADGE[r.state].className}>{STATE_BADGE[r.state].label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.acknowledged_at ? (
                          <span title={formatDateTime(r.acknowledged_at)}>{formatDateTime(r.acknowledged_at)}</span>
                        ) : r.last_reminded_at ? (
                          <span title={formatDateTime(r.last_reminded_at)}>
                            {timeAgo(r.last_reminded_at)}
                            {r.reminder_count > 1 && ` · ${r.reminder_count}×`}
                          </span>
                        ) : (
                          "Never"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <RowAction row={r} busy={busy} onRemind={remind} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function describeWhen(r: AckStatusEmployeeRow): string {
  if (r.acknowledged_at) return `acknowledged ${formatDate(r.acknowledged_at)}`;
  if (r.state === "left") return "left organisation";
  if (r.last_reminded_at) return `reminded ${timeAgo(r.last_reminded_at)}`;
  return STATE_BADGE[r.state].label.toLowerCase();
}

function RowAction({
  row,
  busy,
  onRemind,
}: {
  row: AckStatusEmployeeRow;
  busy: string | null;
  onRemind: (ids: string[]) => void;
}) {
  if (row.state !== "pending" && row.state !== "overdue") return null;
  const cooling = !canRemind(row.last_reminded_at);
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={cooling || busy !== null}
      onClick={() => onRemind([row.employee_id])}
      title={cooling ? "Already reminded in the last 24 hours" : undefined}
    >
      {busy === row.employee_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellRing className="h-3.5 w-3.5" />}
      <span className="ml-1.5">{cooling ? "Reminded" : "Remind"}</span>
    </Button>
  );
}

function StatTile({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className={cn("flex items-center gap-1.5 text-sm", tone)}>
        {icon}
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
