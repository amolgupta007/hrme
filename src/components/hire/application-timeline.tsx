"use client";

import { ArrowDown, ArrowUp, RotateCcw, XCircle, Circle, MessageSquare } from "lucide-react";
import type { ApplicationStage } from "@/actions/hire";
import type { StageTransition } from "@/actions/hire";
import { timeAgo, formatDate } from "@/lib/utils";

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

function directionMeta(direction: StageTransition["direction"]) {
  switch (direction) {
    case "forward":  return { Icon: ArrowUp,    ring: "bg-emerald-100 text-emerald-700", verb: "advanced to" };
    case "backward": return { Icon: ArrowDown,  ring: "bg-orange-100 text-orange-700",   verb: "moved back to" };
    case "reject":   return { Icon: XCircle,    ring: "bg-red-100 text-red-700",         verb: "rejected at" };
    case "undo":     return { Icon: RotateCcw,  ring: "bg-slate-100 text-slate-700",     verb: "undone, back to" };
    case "initial":  return { Icon: Circle,     ring: "bg-gray-100 text-gray-600",       verb: "started in" };
  }
}

function actorLabel(t: StageTransition): string {
  if (t.actor_type === "system") return "System";
  if (t.actor_type === "candidate") return "Candidate";
  return t.actor_name ?? "Unknown";
}

interface Props {
  transitions: StageTransition[];
}

export function ApplicationTimeline({ transitions }: Props) {
  if (transitions.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        No transition history yet.
      </div>
    );
  }

  return (
    <ol className="relative space-y-4 pl-6">
      {/* vertical line */}
      <span className="absolute left-2 top-2 bottom-2 w-px bg-border" aria-hidden="true" />
      {transitions.map((t) => {
        const meta = directionMeta(t.direction);
        const Icon = meta.Icon;
        return (
          <li key={t.id} className="relative">
            <span className={`absolute -left-[18px] top-1 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-background ${meta.ring}`}>
              <Icon className="h-2.5 w-2.5" />
            </span>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-xs font-medium text-foreground">
                {actorLabel(t)}
              </span>
              <span className="text-xs text-muted-foreground">{meta.verb}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${STAGE_CHIP[t.to_stage]}`}>
                {STAGE_LABEL[t.to_stage]}
              </span>
              {t.from_stage && t.direction !== "initial" && (
                <span className="text-xs text-muted-foreground/70">
                  from <span className={`rounded-full px-1.5 py-0.5 ${STAGE_CHIP[t.from_stage]}`}>
                    {STAGE_LABEL[t.from_stage]}
                  </span>
                </span>
              )}
              <span
                className="text-xs text-muted-foreground/70 ml-auto"
                title={formatDate(t.created_at, "MMM d, yyyy 'at' h:mm a")}
              >
                {timeAgo(t.created_at)}
              </span>
            </div>
            {t.comment && (
              <div className="mt-1.5 flex items-start gap-1.5 rounded-md bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
                <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
                <span className="italic">{t.comment}</span>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
