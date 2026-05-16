"use client";

import { useEffect, useState } from "react";
import { Mail, AlertTriangle, ArrowDown, XCircle, ArrowUp } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { TransitionAction } from "@/lib/hire/transitions";
import type { TransitionDirection } from "@/lib/hire/stage-direction";

interface Props {
  open: boolean;
  onClose: () => void;
  candidateLabel: string;
  fromStageLabel: string;
  toStageLabel: string;
  direction: TransitionDirection;
  actions: TransitionAction[];
  // When provided, a textarea appears. Required = Send is gated on a non-empty value.
  commentLabel?: string;
  commentRequired?: boolean;
  commentPlaceholder?: string;
  sending?: boolean;
  // Send fires the user-confirmed subset.
  onSend: (args: { comment: string; enabledKeys: string[] }) => void;
  // Skip All persists the stage change but dispatches no actions. Only shown for
  // post-server popups (forward with actions). Omit for prompt-first flows.
  onSkipAll?: () => void;
}

function directionMeta(direction: TransitionDirection) {
  switch (direction) {
    case "forward":  return { Icon: ArrowUp,    accent: "text-emerald-600", verb: "moving forward" };
    case "backward": return { Icon: ArrowDown,  accent: "text-orange-600",  verb: "moving back" };
    case "reject":   return { Icon: XCircle,    accent: "text-red-600",     verb: "rejecting" };
    case "undo":     return { Icon: AlertTriangle, accent: "text-slate-600", verb: "undoing" };
    case "initial":  return { Icon: ArrowUp,    accent: "text-gray-500",    verb: "starting in" };
  }
}

export function ConfirmTransitionDialog({
  open,
  onClose,
  candidateLabel,
  fromStageLabel,
  toStageLabel,
  direction,
  actions,
  commentLabel,
  commentRequired,
  commentPlaceholder,
  sending,
  onSend,
  onSkipAll,
}: Props) {
  const [comment, setComment] = useState("");
  const [enabledKeys, setEnabledKeys] = useState<Set<string>>(
    () => new Set(actions.filter((a) => a.defaultEnabled).map((a) => a.key)),
  );

  // Reset when the dialog opens with a new transition context.
  useEffect(() => {
    if (open) {
      setComment("");
      setEnabledKeys(new Set(actions.filter((a) => a.defaultEnabled).map((a) => a.key)));
    }
  }, [open, actions]);

  const meta = directionMeta(direction);
  const Icon = meta.Icon;
  const canSend = (!commentRequired || comment.trim().length > 0) && !sending;
  const accentBtn =
    direction === "reject"
      ? "bg-red-600 hover:bg-red-700"
      : direction === "backward"
        ? "bg-orange-600 hover:bg-orange-700"
        : "bg-indigo-600 hover:bg-indigo-700";

  function toggle(key: string) {
    setEnabledKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${meta.accent}`} />
            Confirm {meta.verb}
          </DialogTitle>
          <DialogDescription>
            {candidateLabel} — <span className="font-medium">{fromStageLabel}</span>
            {" → "}
            <span className="font-medium">{toStageLabel}</span>
          </DialogDescription>
        </DialogHeader>

        {commentLabel && (
          <div className="mt-1">
            <label className="text-xs font-medium text-foreground block mb-1">
              {commentLabel}
              {commentRequired && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            <textarea
              className={`w-full rounded-md border px-3 py-2 text-sm min-h-[90px] bg-background focus:outline-none focus:ring-1 ${
                direction === "reject"
                  ? "border-input focus:border-red-400 focus:ring-red-400"
                  : "border-input focus:border-indigo-400 focus:ring-indigo-400"
              }`}
              placeholder={commentPlaceholder ?? ""}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              autoFocus
            />
          </div>
        )}

        {actions.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium text-foreground mb-2">Send the following?</p>
            <ul className="space-y-2">
              {actions.map((action) => {
                const checked = enabledKeys.has(action.key);
                return (
                  <li key={action.key} className="flex items-start gap-2 rounded-md border border-border p-2.5 hover:bg-muted/40">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(action.key)}
                      className="mt-0.5 h-4 w-4 rounded shrink-0 cursor-pointer accent-indigo-600"
                      id={`action-${action.key}`}
                    />
                    <label htmlFor={`action-${action.key}`} className="flex-1 cursor-pointer">
                      <div className="flex items-center gap-1.5 text-xs font-medium">
                        <Mail className="h-3 w-3 text-muted-foreground" />
                        {action.label}
                      </div>
                      {action.description && (
                        <p className="text-xs text-muted-foreground/80 mt-0.5">{action.description}</p>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <DialogFooter className="flex gap-2 justify-end mt-3">
          {onSkipAll && (
            <button
              type="button"
              onClick={onSkipAll}
              disabled={sending}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-60"
            >
              Skip all
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSend({ comment: comment.trim(), enabledKeys: Array.from(enabledKeys) })}
            disabled={!canSend}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60 ${accentBtn}`}
          >
            {sending ? "Saving…" : "Send"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
