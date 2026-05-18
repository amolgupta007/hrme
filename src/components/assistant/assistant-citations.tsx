"use client";
import type { RouteEntry } from "@/lib/assistant/route-registry";
import { TakeMeThereButton } from "./take-me-there-button";

export type HelpCitation = {
  id: string;
  title: string;
  summary: string;
  route?: RouteEntry | null;
};

export function AssistantCitations({ items }: { items: HelpCitation[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-2 space-y-2 rounded-xl border border-border bg-muted/40 p-3 text-xs">
      <p className="font-medium text-muted-foreground">Sources</p>
      {items.map((c, i) => (
        <div key={`${c.id}-${i}`} className="space-y-1">
          <p className="leading-snug">
            <span className="text-muted-foreground">[{i + 1}]</span>{" "}
            <span className="font-medium">{c.title}</span>
            {" — "}
            <span className="text-muted-foreground">{c.summary}</span>
          </p>
          {c.route && <TakeMeThereButton route={c.route} />}
        </div>
      ))}
    </div>
  );
}
