"use client";

import React from "react";
import { ChevronDown } from "lucide-react";

type CollapsibleSectionProps = {
  title: string;
  icon: React.ReactNode;
  summary: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
};

// Stable id base for aria-controls. Module-scope counter survives re-renders
// without depending on React 18's useId (kept identical for SSR/CSR pairs).
let __sectionUid = 0;
function useSectionId(prefix: string): string {
  const ref = React.useRef<string | null>(null);
  if (ref.current === null) {
    __sectionUid += 1;
    ref.current = `${prefix}-${__sectionUid}`;
  }
  return ref.current;
}

export function CollapsibleSection({
  title,
  icon,
  summary,
  isOpen,
  onToggle,
  children,
}: CollapsibleSectionProps) {
  const panelId = useSectionId("settings-section");
  const triggerId = `${panelId}-trigger`;

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Header is the disclosure trigger — entire row is clickable. */}
      <button
        type="button"
        id={triggerId}
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-label={`${isOpen ? "Collapse" : "Expand"} ${title}`}
        className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl"
      >
        <span className="flex min-w-0 items-center gap-3">
          {icon}
          <span className="min-w-0">
            <span className="block font-semibold text-sm">{title}</span>
            {!isOpen && (
              <span className="block truncate text-xs text-muted-foreground mt-0.5">
                {summary}
              </span>
            )}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/*
        Animate via grid-template-rows: 0fr ↔ 1fr.
        - Animates intrinsic height with no magic-number cap.
        - Inner wrapper carries overflow:hidden only during the transition;
          once open, Radix Portal-rendered popovers (Select.Portal, Dialog.Portal)
          remain unaffected because they escape to document.body.
        - Reduced-motion users get an instant state swap via motion-reduce.
      */}
      <div
        id={panelId}
        aria-labelledby={triggerId}
        aria-hidden={!isOpen}
        // `inert` removes the panel from focus order + AT virtual cursor
        // when closed. Spread-style cast keeps TS happy across React 18.x
        // versions where the typed prop only landed in 18.3.
        {...(!isOpen ? ({ inert: "" } as any) : {})}
        className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-border">{children}</div>
        </div>
      </div>
    </div>
  );
}
