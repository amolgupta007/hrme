"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Info, TriangleAlert } from "lucide-react";
import { normFor } from "@jambahr/shared/payroll/norms";

/**
 * The industry-norm side note under a payroll setting (plan D5). Advisory
 * only, never blocks a save.
 *
 * Collapsed by default to a small "Usual practice" trigger; the full note
 * opens in a light bordered panel on hover, click or keyboard focus, and
 * closes on hover-out, a click elsewhere, or Esc. The amber "differs from the
 * usual" hint is the one part that stays visible, because it is the case
 * where the note matters.
 */
export function NormNote({ normKey, value, month }: { normKey: string; value?: unknown; month?: string }) {
  const norm = normFor(normKey);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!norm) return null;
  const hint = value !== undefined && norm.deviates ? norm.deviates(value, { month }) : null;

  return (
    <div className="mt-1 space-y-1 text-xs">
      {hint && (
        <p className="flex gap-1.5 text-amber-700 dark:text-amber-400">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{hint}</span>
        </p>
      )}
      <div
        ref={ref}
        className="relative inline-block"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          onFocus={() => setOpen(true)}
          onBlur={(e) => {
            if (!ref.current?.contains(e.relatedTarget as Node)) setOpen(false);
          }}
          className="inline-flex items-center gap-1 rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Info className="h-3.5 w-3.5" aria-hidden />
          <span>Usual practice{norm.typical ? `: ${norm.typical}` : ""}</span>
        </button>
        {open && (
          // pt-1 bridges the gap so moving the pointer from trigger to panel keeps it open.
          <div className="absolute left-0 top-full z-30 pt-1">
            <div
              id={panelId}
              role="note"
              className="w-[min(28rem,80vw)] rounded-md border bg-muted p-3 leading-relaxed text-muted-foreground shadow-md"
            >
              <p>{norm.text}</p>
              <p className="mt-2 text-[11px]">
                As of {norm.asOf}
                {norm.statutory ? " · statutory figure — confirm with your CA or payroll consultant" : ""}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
