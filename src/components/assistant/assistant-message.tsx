"use client";
import { cn } from "@/lib/utils";
import { isToolUIPart, getToolName, type UIMessage } from "ai";
import { AssistantToolChip } from "./assistant-tool-chip";
import { AssistantCitations, type HelpCitation } from "./assistant-citations";
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

  // Build citations from app_help.search outputs and attach routes from app_help.get_route.
  const citations: HelpCitation[] = [];
  const routeByFeatureKey = new Map<string, RouteEntry>();

  for (const part of toolParts) {
    if (part.state !== "output-available") continue;
    const toolName = getToolName(part);
    const out = part.output as unknown;

    if (toolName === "app_help_search" && Array.isArray(out)) {
      for (const r of out as Array<{ id: string; title: string; summary: string }>) {
        citations.push({ id: r.id, title: r.title, summary: r.summary });
      }
    } else if (
      toolName === "app_help_get_route" &&
      out !== null &&
      typeof out === "object" &&
      "path" in (out as object)
    ) {
      // The feature_key that was passed as input - used to match citations.
      const featureKey = (part.input as { feature_key?: string } | undefined)?.feature_key;
      if (featureKey) {
        routeByFeatureKey.set(featureKey, out as RouteEntry);
      }
    }
  }

  // Attach routes to citations whose id matches a resolved feature_key.
  for (const c of citations) {
    const route = routeByFeatureKey.get(c.id);
    if (route) c.route = route;
  }
  // Fallback: if exactly one route resolved and wasn't matched by id, attach it to all
  // unrouted citations (covers the common case where route_key !== article id).
  if (routeByFeatureKey.size === 1) {
    const [singleRoute] = routeByFeatureKey.values();
    for (const c of citations) {
      if (!c.route) c.route = singleRoute;
    }
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
        <div>
          {textBody || (toolParts.length === 0 && <span className="opacity-60">...</span>)}
        </div>
        {!isUser && <AssistantCitations items={citations} />}
      </div>
    </div>
  );
}
