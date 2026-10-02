import Link from "next/link";
import { Cake, ChevronRight, Home, PartyPopper } from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
import type { TeamUpcoming, UpcomingPerson } from "@/actions/team-upcoming";

// Server components (no hooks). Dates are YYYY-MM-DD in IST.

function dayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  if (date === tomorrow) return "Tomorrow";
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function Avatar({ person, className }: { person: UpcomingPerson; className?: string }) {
  return (
    <div
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-card",
        className,
      )}
      title={person.name}
    >
      {person.avatarUrl ? (
        <img src={person.avatarUrl} alt={person.name} className="h-7 w-7 rounded-full object-cover" />
      ) : (
        getInitials(person.name)
      )}
    </div>
  );
}

function CardHeader({ title, href, linkLabel }: { title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-3">
      <p className="text-sm font-semibold">{title}</p>
      {href && (
        <Link href={href} className="flex items-center gap-1 text-xs text-primary hover:underline">
          {linkLabel} <ChevronRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

export function WfhWeekCard({ data, today }: { data: TeamUpcoming; today: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <CardHeader title="Working from home · next 7 days" href="/dashboard/leaves" linkLabel="Request WFH" />
      {data.wfhDays.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <Home className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No one has approved work from home this week.</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {data.wfhDays.map((day) => (
            <div key={day.date} className="flex items-start gap-3 px-4 py-2.5">
              <p
                className={cn(
                  "w-20 shrink-0 pt-0.5 text-xs font-medium",
                  day.date === today ? "text-violet-700 dark:text-violet-300" : "text-muted-foreground",
                )}
              >
                {dayLabel(day.date, today)}
              </p>
              <p className="min-w-0 flex-1 text-sm">{day.people.map((p) => p.name).join(", ")}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CelebrationsCard({ data, today }: { data: TeamUpcoming; today: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <CardHeader title="Birthdays & work anniversaries" />
      {data.celebrations.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <PartyPopper className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Nothing in the next two weeks.</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {data.celebrations.slice(0, 8).map((c) => {
            const isToday = c.daysAway === 0;
            return (
              <div
                key={`${c.employeeId}-${c.kind}`}
                className={cn("flex items-center gap-3 px-4 py-2.5", isToday && "bg-amber-50/60 dark:bg-amber-950/20")}
              >
                <Avatar person={{ id: c.employeeId, name: c.name, avatarUrl: c.avatarUrl }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    {c.kind === "birthday" ? (
                      <>
                        <Cake className="h-3 w-3 text-pink-500" /> Birthday
                      </>
                    ) : (
                      <>
                        <PartyPopper className="h-3 w-3 text-amber-500" />
                        {c.years} year{c.years === 1 ? "" : "s"} at {data.orgName.trim()}
                      </>
                    )}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                    isToday
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {dayLabel(c.date, today)}
                </span>
              </div>
            );
          })}
          {data.celebrations.length > 8 && (
            <p className="px-4 py-2 text-center text-xs text-muted-foreground">
              +{data.celebrations.length - 8} more in the next two weeks
            </p>
          )}
        </div>
      )}
    </div>
  );
}
