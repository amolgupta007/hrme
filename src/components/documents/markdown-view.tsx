// src/components/documents/markdown-view.tsx
// Renders the markdown-subset (same parser the PDF uses) to React, so the
// on-screen document and the PDF read identically. Pure — safe in server or
// client components.
import React from "react";
import { parseMarkdown, type InlineRun } from "@/lib/documents/markdown";

function Runs({ runs }: { runs: InlineRun[] }) {
  return (
    <>
      {runs.map((r, i) => {
        let node: React.ReactNode = r.text;
        if (r.bold) node = <strong key={i}>{node}</strong>;
        if (r.italic) node = <em key={i}>{node}</em>;
        return <React.Fragment key={i}>{node}</React.Fragment>;
      })}
    </>
  );
}

export function MarkdownView({ markdown, className }: { markdown: string; className?: string }) {
  const blocks = parseMarkdown(markdown);
  return (
    <div className={className}>
      {blocks.map((block, i) => {
        switch (block.type) {
          case "heading": {
            const Tag = (`h${block.level + 2}`) as "h3" | "h4" | "h5";
            return (
              <Tag key={i} className="font-semibold text-foreground mt-3 mb-1">
                <Runs runs={block.runs} />
              </Tag>
            );
          }
          case "paragraph":
            return (
              <p key={i} className="text-sm text-foreground/90 leading-relaxed mb-2">
                <Runs runs={block.runs} />
              </p>
            );
          case "ul":
            return (
              <ul key={i} className="list-disc pl-5 mb-2 space-y-1">
                {block.items.map((item, j) => (
                  <li key={j} className="text-sm text-foreground/90">
                    <Runs runs={item} />
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="list-decimal pl-5 mb-2 space-y-1">
                {block.items.map((item, j) => (
                  <li key={j} className="text-sm text-foreground/90">
                    <Runs runs={item} />
                  </li>
                ))}
              </ol>
            );
        }
      })}
    </div>
  );
}
