"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CheckCircle2,
  Clock,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { cn, formatDate, formatDateTime, timeAgo } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MarkdownView } from "@/components/documents/markdown-view";
import { announcementAnchor, categoryMeta } from "@/lib/announcements/categories";
import type { Announcement } from "@/actions/announcements";

interface AnnouncementCardProps {
  announcement: Announcement;
  canManage: boolean;
  highlighted?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onAcknowledge: () => void;
}

function audienceLabel(a: Announcement): string {
  if (a.audience_type === "all") return "Everyone";
  const names = a.targets.map((t) => t.label);
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

export function AnnouncementCard({
  announcement: a,
  canManage,
  highlighted,
  onEdit,
  onDelete,
  onTogglePin,
  onAcknowledge,
}: AnnouncementCardProps) {
  const cat = categoryMeta(a.category);
  const pending = a.my_ack && a.my_ack.state !== "acknowledged";
  const overdue = a.my_ack?.state === "overdue";
  const totals = a.ack_totals;
  const pct = totals && totals.total > 0 ? (totals.acknowledged / totals.total) * 100 : 0;

  return (
    <article
      id={announcementAnchor(a.id)}
      className={cn(
        "scroll-mt-24 rounded-xl border bg-card transition-shadow",
        a.is_pinned ? "border-primary/40" : "border-border",
        pending && "border-l-4 border-l-primary",
        overdue && "border-l-destructive",
        highlighted && "ring-2 ring-primary/40"
      )}
    >
      {pending && (
        <div
          className={cn(
            "flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5",
            overdue ? "border-destructive/20 bg-destructive/5" : "border-primary/15 bg-primary/5"
          )}
        >
          <p className="flex items-center gap-2 text-sm font-medium">
            {overdue ? (
              <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
            ) : (
              <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
            )}
            {overdue
              ? `Acknowledgement overdue — was due ${formatDate(a.ack_due_date!)}`
              : a.ack_due_date
                ? `Please acknowledge by ${formatDate(a.ack_due_date)}`
                : "Your acknowledgement is required"}
          </p>
          <Button size="sm" onClick={onAcknowledge} className="self-start sm:self-auto">
            Read &amp; acknowledge
          </Button>
        </div>
      )}

      <div className="p-4 sm:p-5">
        <header className="flex items-start gap-3">
          <PersonAvatar name={a.created_by_name} src={a.created_by_avatar_url} className="h-9 w-9" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge className={cat.chip}>{cat.label}</Badge>
              {a.is_pinned && (
                <Badge className="gap-1 border-transparent bg-primary/10 text-primary">
                  <Pin className="h-3 w-3" /> Pinned
                </Badge>
              )}
              {a.ack_required && !pending && (
                <Badge variant="outline" className="gap-1 font-medium">
                  <ShieldCheck className="h-3 w-3" /> Acknowledgement required
                </Badge>
              )}
            </div>
            <h2 className="mt-1.5 text-base font-semibold leading-snug sm:text-lg">{a.title}</h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
              <span>{a.created_by_name ?? "Admin"}</span>
              <span aria-hidden>·</span>
              <time dateTime={a.created_at} title={formatDateTime(a.created_at)}>
                {timeAgo(a.created_at)}
              </time>
              {a.edited && (
                <>
                  <span aria-hidden>·</span>
                  <span title={`Edited ${formatDateTime(a.updated_at)}`}>edited</span>
                </>
              )}
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                {a.audience_type === "all" ? <Users className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
                {audienceLabel(a)}
              </span>
            </p>
          </div>

          {canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="-mr-1 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Announcement actions"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onTogglePin}>
                  {a.is_pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                  {a.is_pinned ? "Unpin" : "Pin to top"}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onEdit}>
                  <Pencil className="h-4 w-4" /> Edit
                </DropdownMenuItem>
                {a.ack_required && (
                  <DropdownMenuItem asChild>
                    <Link href={`/dashboard/announcements/${a.id}`}>
                      <BarChart3 className="h-4 w-4" /> Acknowledgement status
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={onDelete}>
                  <Trash2 className="h-4 w-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </header>

        <div className="mt-3 sm:pl-12">
          <MarkdownView markdown={a.body} />

          {a.my_ack?.state === "acknowledged" && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
              <CheckCircle2 className="h-3.5 w-3.5" />
              You acknowledged this on {formatDateTime(a.my_ack.acknowledged_at!)}
            </p>
          )}

          {canManage && totals && (
            <Link
              href={`/dashboard/announcements/${a.id}`}
              className="mt-4 block rounded-lg border border-border p-3 transition-colors hover:bg-muted/40"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">
                  {totals.acknowledged} of {totals.total} acknowledged
                </span>
                <span className="flex items-center gap-2 text-muted-foreground">
                  {totals.overdue > 0 && (
                    <span className="inline-flex items-center gap-1 text-destructive">
                      <Clock className="h-3 w-3" /> {totals.overdue} overdue
                    </span>
                  )}
                  View status →
                </span>
              </div>
              <Progress value={pct} className="mt-2 h-1.5" />
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
