"use client";
import { Search, FileText, MapPin, FileSearch, Files } from "lucide-react";

const TOOL_LABELS: Record<string, string> = {
  "app_help_search": "Searching help articles",
  "app_help_get_steps": "Fetching step-by-step",
  "app_help_get_route": "Resolving destination",
  "docs_search": "Searching your documents",
  "docs_get_chunk": "Reading document",
  "docs_list_recent": "Listing recent documents",
};

const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "app_help_search": Search,
  "app_help_get_steps": FileText,
  "app_help_get_route": MapPin,
  "docs_search": FileSearch,
  "docs_get_chunk": FileText,
  "docs_list_recent": Files,
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
