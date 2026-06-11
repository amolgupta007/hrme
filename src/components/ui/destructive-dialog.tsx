"use client";

import * as React from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * DestructiveDialog
 *
 * Replacement for `window.confirm()` on destructive actions. Built on
 * Radix AlertDialog so it traps focus, handles Esc + outside-click, and
 * portals out of any surrounding `overflow:hidden` container.
 *
 * Controlled. The caller owns `open` state; pass an `onConfirm` that runs
 * the mutation. The dialog closes itself only when the consumer flips
 * `open` to false — typically inside `onConfirm`'s `.then` /`.finally`.
 * This matches every other Dialog in the codebase and keeps the mutation
 * flow untouched.
 */
export interface DestructiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Short noun phrase. e.g. "Delete department?" */
  title: string;
  /** Context + consequence. May span multiple sentences. Optional. */
  description?: React.ReactNode;
  /** Verb label for the destructive button. Defaults to "Delete". */
  confirmLabel?: string;
  /** Label for the safe button. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Suppress dismissal + show spinner while the mutation runs. */
  loading?: boolean;
  /**
   * Runs when the user clicks the destructive button. The dialog will not
   * auto-close — the caller flips `open` after the mutation resolves.
   */
  onConfirm: () => void | Promise<void>;
}

export function DestructiveDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  loading = false,
  onConfirm,
}: DestructiveDialogProps) {
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        // Block dismissal while a mutation is in flight so the
        // operator can't half-cancel a server-bound action.
        if (loading && !next) return;
        onOpenChange(next);
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/50 backdrop-blur-sm",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          )}
        />
        <AlertDialog.Content
          className={cn(
            "fixed left-[50%] top-[50%] z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2",
            "rounded-xl border border-border bg-background p-6 shadow-xl",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          )}
        >
          <AlertDialog.Title className="text-base font-semibold leading-tight">
            {title}
          </AlertDialog.Title>
          {description ? (
            <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
              {description}
            </AlertDialog.Description>
          ) : null}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel asChild>
              <Button variant="outline" disabled={loading}>
                {cancelLabel}
              </Button>
            </AlertDialog.Cancel>
            {/*
              Important: don't auto-close on click. We let the caller close
              by flipping `open` after the mutation resolves — matches the
              Dialog patterns used elsewhere and keeps the loading state
              visible on this dialog (not on a vanished one).
            */}
            <Button
              variant="destructive"
              disabled={loading}
              onClick={(e) => {
                e.preventDefault();
                void onConfirm();
              }}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Working…
                </>
              ) : (
                confirmLabel
              )}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
