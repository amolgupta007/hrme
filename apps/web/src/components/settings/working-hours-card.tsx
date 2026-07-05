"use client";

import * as React from "react";
import { Pencil, Check, X, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { updateAttendanceSettings } from "@/actions/attendance";
import type { AttendanceSettings } from "@/actions/attendance";

interface Props {
  settings: AttendanceSettings;
}

export function WorkingHoursCard({ settings }: Props) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(String(settings.standardWorkdayHours));
  const [saving, setSaving] = React.useState(false);
  const [current, setCurrent] = React.useState(settings.standardWorkdayHours);

  function startEdit() {
    setValue(String(current));
    setEditing(true);
  }

  function cancel() {
    setValue(String(current));
    setEditing(false);
  }

  async function save() {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      toast.error("Enter a valid number");
      return;
    }
    setSaving(true);
    const result = await updateAttendanceSettings({ standardWorkdayHours: n });
    setSaving(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    const rounded = Math.round(n * 10) / 10;
    setCurrent(rounded);
    setValue(String(rounded));
    setEditing(false);
    toast.success("Working hours updated");
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-start justify-between gap-4">
      <div className="flex items-start gap-3 min-w-0">
        <div className="rounded-lg bg-primary/10 p-2 shrink-0">
          <Clock className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Default Working Hours</p>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-md">
            Used when an employee forgets to clock out. Auto clock-out at midnight is computed as
            clock-in + this many hours, capped at 23:59 of the same date.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {!editing ? (
          <>
            <span className="text-lg font-semibold tabular-nums">{current}h</span>
            <Button variant="ghost" size="sm" onClick={startEdit}>
              <Pencil className="h-3.5 w-3.5 mr-1" />
              Edit
            </Button>
          </>
        ) : (
          <>
            <input
              type="number"
              min={1}
              max={16}
              step={0.5}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
              className="h-8 w-20 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <span className="text-sm text-muted-foreground">h</span>
            <Button variant="default" size="sm" onClick={save} disabled={saving}>
              <Check className="h-3.5 w-3.5 mr-1" />
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button variant="ghost" size="sm" onClick={cancel} disabled={saving}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
