"use client";
import { cn } from "@/lib/utils";
import { isToolUIPart, getToolName, type UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AssistantToolChip } from "./assistant-tool-chip";
import { AssistantCitations, type Citation } from "./assistant-citations";
import type { RouteEntry } from "@/lib/assistant/route-registry";

export function AssistantMessage({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";

  // Collect text body from all text parts.
  const textBody = message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");

  // Collect tool parts (both static ToolUIPart and DynamicToolUIPart).
  const toolParts = message.parts.filter(isToolUIPart);

  // Build citations from tool outputs.
  const citations: Citation[] = [];
  const routeByFeatureKey = new Map<string, RouteEntry>();

  // Doc-specific tracking: dedupe by document_id, ack info from docs_get_chunk.
  const docCitationIndexById = new Map<string, number>();
  const ackNeededByDocId = new Map<string, boolean>();

  for (const part of toolParts) {
    if (part.state !== "output-available") continue;
    const toolName = getToolName(part);
    const out = part.output as unknown;

    if (toolName === "app_help_search" && Array.isArray(out)) {
      for (const r of out as Array<{ id: string; title: string; summary: string }>) {
        citations.push({ kind: "help", id: r.id, title: r.title, summary: r.summary });
      }
    } else if (
      toolName === "app_help_get_route" &&
      out !== null &&
      typeof out === "object" &&
      "path" in (out as object)
    ) {
      const featureKey = (part.input as { feature_key?: string } | undefined)?.feature_key;
      if (featureKey) {
        routeByFeatureKey.set(featureKey, out as RouteEntry);
      }
    } else if (toolName === "docs_search" && Array.isArray(out)) {
      for (const r of out as Array<{
        chunk_id: string;
        document_id: string;
        title: string;
        category: string;
        snippet: string;
        score: number;
      }>) {
        if (!docCitationIndexById.has(r.document_id)) {
          const idx = citations.length;
          docCitationIndexById.set(r.document_id, idx);
          citations.push({
            kind: "doc",
            document_id: r.document_id,
            title: r.title,
            category: r.category,
            snippet: r.snippet,
          });
        }
      }
    } else if (toolName === "docs_get_chunk" && out !== null && typeof out === "object") {
      const chunk = out as {
        document_id: string;
        requires_acknowledgment: boolean;
        user_has_acknowledged: boolean;
      };
      ackNeededByDocId.set(
        chunk.document_id,
        chunk.requires_acknowledgment && !chunk.user_has_acknowledged,
      );
    }
  }

  // Attach routes to help citations whose id matches a resolved feature_key.
  for (const c of citations) {
    if (c.kind !== "help") continue;
    const route = routeByFeatureKey.get(c.id);
    if (route) c.route = route;
  }
  // Fallback: if exactly one route resolved and wasn't matched by id, attach it to all
  // unrouted help citations (covers the common case where route_key !== article id).
  if (routeByFeatureKey.size === 1) {
    const [singleRoute] = routeByFeatureKey.values();
    for (const c of citations) {
      if (c.kind === "help" && !c.route) c.route = singleRoute;
    }
  }

  // Attach ack flags to doc citations.
  for (const c of citations) {
    if (c.kind !== "doc") continue;
    const needsAck = ackNeededByDocId.get(c.document_id);
    if (needsAck === true) c.needsAck = true;
  }

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] space-y-2 rounded-2xl px-4 py-2 text-sm leading-relaxed",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
        )}
      >
        {toolParts.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {toolParts.map((p, i) => {
              const chipState =
                p.state === "output-available"
                  ? "done"
                  : p.state === "output-error" || p.state === "output-denied"
                    ? "error"
                    : "running";
              return (
                <AssistantToolChip key={i} toolName={getToolName(p)} state={chipState} />
              );
            })}
          </div>
        )}
        <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2">
          {textBody ? (
            isUser ? (
              <p className="whitespace-pre-wrap">{textBody}</p>
            ) : (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{textBody}</ReactMarkdown>
            )
          ) : (
            toolParts.length === 0 && <span className="opacity-60">...</span>
          )}
        </div>
        {!isUser && <AssistantCitations items={citations} />}
      </div>
    </div>
  );
}
