"use client";

import { CalendarDays } from "lucide-react";
import type { MyScheduleDay } from "@/lib/attendance/schedule-resolve";

function hhmm(t: string | null): string | null {
  return t ? t.slice(0, 5) : null;
}

function dayLabel(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00.000Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function MyScheduleCard({ schedule }: { schedule: MyScheduleDay[] }) {
  if (!schedule.length) return null;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-semibold">My Schedule · Next 7 Days</p>
      </div>
      <div className="divide-y divide-border">
        {schedule.map((day, i) => (
          <div key={day.date} className="flex items-center justify-between px-5 py-2.5 gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">{i === 0 ? "Today" : day.weekday}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{dayLabel(day.date)}</p>
            </div>
            <div className="text-right text-sm">
              {day.isHoliday ? (
                <span className="text-amber-600 dark:text-amber-400 font-medium">
                  {day.holidayName ?? "Holiday"}
                </span>
              ) : day.isWeekOff ? (
                <span className="text-muted-foreground">Week off</span>
              ) : day.shiftName ? (
                <span className="inline-flex flex-wrap items-center justify-end gap-x-2">
                  <span className="font-medium text-foreground">{day.shiftName}</span>
                  {hhmm(day.startTime) && hhmm(day.endTime) && (
                    <span className="text-xs text-muted-foreground">
                      {hhmm(day.startTime)}–{hhmm(day.endTime)}
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-muted-foreground">No shift assigned</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
