"use client";
import { Search, FileText, MapPin } from "lucide-react";

const TOOL_LABELS: Record<string, string> = {
  "app_help.search": "Searching help articles",
  "app_help.get_steps": "Fetching step-by-step",
  "app_help.get_route": "Resolving destination",
};

const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "app_help.search": Search,
  "app_help.get_steps": FileText,
  "app_help.get_route": MapPin,
};

export function AssistantToolChip({
  toolName,
  state,
}: {
  toolName: string;
  state: "running" | "done" | "error";
}) {
  const label = TOOL_LABELS[toolName] ?? toolName;
  const Icon = TOOL_ICONS[toolName] ?? Search;
  return (
    <div
      className={
        state === "error"
          ? "inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive"
          : "inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
      }
    >
      <Icon className={state === "running" ? "h-3 w-3 animate-pulse" : "h-3 w-3"} />
      <span>
        {label}
        {state === "running" ? "…" : ""}
      </span>
    </div>
  );
}
