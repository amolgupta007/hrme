"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const key = (year: number) => `jambahr:holiday-nudge-dismissed:${year}`;

export function HolidayNudgeBanner({ year }: { year: number }) {
  const [show, setShow] = React.useState(false);

  React.useEffect(() => {
    try {
      setShow(window.sessionStorage.getItem(key(year)) !== "1");
    } catch {
      setShow(true);
    }
  }, [year]);

  if (!show) return null;

  const dismiss = () => {
    try { window.sessionStorage.setItem(key(year), "1"); } catch { /* storage blocked: hide for this view */ }
    setShow(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
      <CalendarPlus className="h-4 w-4 shrink-0 text-primary" />
      <p className="min-w-0 flex-1">
        <span className="font-medium">Set up your {year} holidays</span>
        <span className="text-muted-foreground"> so leave, attendance and payroll know which days are off.</span>
      </p>
      <Button asChild size="sm">
        <Link href="/dashboard/settings?section=holidays">Set up holidays</Link>
      </Button>
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="rounded p-1 text-muted-foreground hover:bg-muted">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
