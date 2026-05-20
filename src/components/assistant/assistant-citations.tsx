"use client";
import Link from "next/link";
import type { RouteEntry } from "@/lib/assistant/route-registry";
import { TakeMeThereButton } from "./take-me-there-button";

export type HelpCitation = {
  kind: "help";
  id: string;
  title: string;
  summary: string;
  route?: RouteEntry | null;
};

export type DocCitation = {
  kind: "doc";
  document_id: string;
  title: string;
  category: string;
  snippet: string;
  needsAck?: boolean;
};

export type Citation = HelpCitation | DocCitation;

export function AssistantCitations({ items }: { items: Citation[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-2 space-y-2 rounded-xl border border-border bg-muted/40 p-3 text-xs">
      <p className="font-medium text-muted-foreground">Sources</p>
      {items.map((c, i) => {
        if (c.kind === "help") {
          return (
            <div key={`help-${c.id}-${i}`} className="space-y-1">
              <p className="leading-snug">
                <span className="text-muted-foreground">[{i + 1}]</span>{" "}
                <span className="font-medium">{c.title}</span>
                {" — "}
                <span className="text-muted-foreground">{c.summary}</span>
              </p>
              {c.route && <TakeMeThereButton route={c.route} />}
            </div>
          );
        }

        // doc kind
        return (
          <div key={`doc-${c.document_id}-${i}`} className="space-y-1">
            <p className="leading-snug">
              <span className="text-muted-foreground">[{i + 1}]</span>{" "}
              <span className="font-medium">{c.title}</span>{" "}
              <span className="rounded bg-muted px-1 py-0.5 text-[10px] capitalize text-muted-foreground">
                {c.category}
              </span>
            </p>
            {c.snippet && (
              <p className="line-clamp-2 text-muted-foreground">{c.snippet}</p>
            )}
            <Link
              href="/dashboard/documents"
              className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
            >
              Open document →
            </Link>
            {c.needsAck && (
              <div className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
                You haven&apos;t acknowledged this policy yet.{" "}
                <Link
                  href="/dashboard/documents"
                  className="font-medium underline underline-offset-2"
                >
                  Read &amp; acknowledge →
                </Link>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
