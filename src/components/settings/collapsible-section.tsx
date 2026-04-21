"use client";

import React from "react";

type CollapsibleSectionProps = {
  title: string;
  icon: React.ReactNode;
  summary: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
};

export function CollapsibleSection({
  title,
  icon,
  summary,
  isOpen,
  onToggle,
  children,
}: CollapsibleSectionProps) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          {icon}
          <div>
            <h3 className="font-semibold text-sm">{title}</h3>
            {!isOpen && (
              <p className="text-xs text-muted-foreground mt-0.5">{summary}</p>
            )}
          </div>
        </div>
        <button
          onClick={onToggle}
          className="shrink-0 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
        >
          {isOpen ? "Close ✕" : "Manage ›"}
        </button>
      </div>
      <div
        className={`overflow-hidden transition-all duration-200 ${
          isOpen ? "max-h-[3000px]" : "max-h-0"
        }`}
      >
        <div className="border-t border-border">
          {children}
        </div>
      </div>
    </div>
  );
}
