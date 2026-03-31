"use client";

import { Calendar, Download } from "lucide-react";
import { getGoogleCalendarUrl, getOutlookCalendarUrl, downloadICS } from "@/lib/calendar";
import type { CalendarEvent } from "@/lib/calendar";

interface Props {
  event: CalendarEvent;
}

export function CalendarLinks({ event }: Props) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted-foreground font-medium">Add to calendar:</span>
      <a
        href={getGoogleCalendarUrl(event)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted transition-colors"
      >
        <Calendar className="h-3 w-3 text-red-500" />
        Google
      </a>
      <a
        href={getOutlookCalendarUrl(event)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted transition-colors"
      >
        <Calendar className="h-3 w-3 text-blue-500" />
        Outlook
      </a>
      <button
        onClick={() => downloadICS(event)}
        className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted transition-colors"
      >
        <Download className="h-3 w-3 text-muted-foreground" />
        .ics
      </button>
    </div>
  );
}
