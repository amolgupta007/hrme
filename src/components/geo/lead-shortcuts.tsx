"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SiblingLead {
  id: string;
  name: string;
}

interface LeadShortcutsProps {
  prev: SiblingLead | null;
  next: SiblingLead | null;
  /** Called when `e` fires. Parent stays the source of truth for dialogs. */
  onEdit: () => void;
  /** Called when `v` fires. */
  onLogVisit: () => void;
  /** Whether `e` and `v` should actually trigger (mirrors canAct on the page). */
  enabled: boolean;
}

const SHORTCUTS: Array<{ key: string; what: string }> = [
  { key: "k", what: "Previous lead" },
  { key: "j", what: "Next lead" },
  { key: "e", what: "Edit lead" },
  { key: "v", what: "Log visit" },
  { key: "Esc", what: "Back to leads" },
  { key: "?", what: "Show this overlay" },
];

/**
 * Window-level keyboard shortcuts for the lead detail surface. Mounted
 * once per page render; cleans up on unmount. Skips when the active
 * element is a text input / textarea / contenteditable so typing into the
 * Edit dialog or a notes field doesn't trigger navigation.
 *
 * Renders a "?" overlay listing the bindings. The overlay is the
 * discoverability layer — without it, Alex finds out the shortcuts exist
 * by accident.
 */
export function LeadShortcuts({
  prev,
  next,
  onEdit,
  onLogVisit,
  enabled,
}: LeadShortcutsProps) {
  const router = useRouter();
  const [overlayOpen, setOverlayOpen] = useState(false);

  useEffect(() => {
    function isEditableTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (target.isContentEditable) return true;
      // Radix Select trigger renders as a <button> with role="combobox"; we
      // do NOT want j/k to fire while the picker is focused either.
      const role = target.getAttribute("role");
      if (role === "combobox" || role === "listbox") return true;
      return false;
    }

    function handler(e: KeyboardEvent) {
      // Allow Esc + ? even when an overlay or dialog is open; they're the
      // escape hatches.
      if (isEditableTarget(e.target) && e.key !== "Escape" && e.key !== "?") {
        return;
      }
      // Modifier-key combos go to the browser/app.
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case "?": {
          e.preventDefault();
          setOverlayOpen((v) => !v);
          break;
        }
        case "Escape": {
          if (overlayOpen) {
            setOverlayOpen(false);
            break;
          }
          // Only navigate back if no other dialog has captured focus. The
          // isEditableTarget gate above handles most cases; the dialog
          // backdrop click is the canonical "close dialog" path.
          router.push("/geo/leads");
          break;
        }
        case "k": {
          if (prev) {
            e.preventDefault();
            router.push(`/geo/leads/${prev.id}`);
          }
          break;
        }
        case "j": {
          if (next) {
            e.preventDefault();
            router.push(`/geo/leads/${next.id}`);
          }
          break;
        }
        case "e": {
          if (enabled) {
            e.preventDefault();
            onEdit();
          }
          break;
        }
        case "v": {
          if (enabled) {
            e.preventDefault();
            onLogVisit();
          }
          break;
        }
      }
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [prev, next, onEdit, onLogVisit, enabled, overlayOpen, router]);

  return (
    <Dialog open={overlayOpen} onOpenChange={setOverlayOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <ul className="grid gap-2 py-2">
          {SHORTCUTS.map((s) => (
            <li
              key={s.key}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-muted-foreground">{s.what}</span>
              <kbd className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-xs">
                {s.key}
              </kbd>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Shortcuts pause while you&apos;re typing in a field.
        </p>
      </DialogContent>
    </Dialog>
  );
}
