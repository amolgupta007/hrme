"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Fingerprint, Laptop, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { updateTimekeepingSource, type AttendanceSettings } from "@/actions/attendance";
import type { TimekeepingMode } from "@jambahr/shared/attendance/timekeeping";

const OPTIONS: Array<{ value: TimekeepingMode; title: string; description: string; icon: typeof Laptop }> = [
  {
    value: "all",
    title: "All punches",
    description:
      "Web, mobile app and biometric devices all count. The first punch of the day is the clock-in, the last is the clock-out.",
    icon: Fingerprint,
  },
  {
    value: "web_app",
    title: "Web & app only — devices show presence",
    description:
      "Clock-in, clock-out, hours and lateness come only from the web and the mobile app. Biometric devices just record that someone came to the office.",
    icon: Laptop,
  },
];

export function TimekeepingSourceCard({ settings }: { settings: AttendanceSettings }) {
  const [source, setSource] = useState<TimekeepingMode>(settings.timekeepingSource);
  const [saving, setSaving] = useState(false);
  const dirty = source !== settings.timekeepingSource;

  async function save() {
    setSaving(true);
    const res = await updateTimekeepingSource({ source });
    setSaving(false);
    if (!res.success) return void toast.error(res.error);
    toast.success(
      source === "web_app"
        ? "Clock-in/out now comes from web & app only (from today)"
        : "All punches now count toward clock-in/out (from today)"
    );
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div>
        <h3 className="font-semibold">Clock-in/out source</h3>
        <p className="text-sm text-muted-foreground">Which punches decide clock-in, clock-out and working hours.</p>
      </div>

      <div role="radiogroup" aria-label="Clock-in/out source" className="grid gap-2 sm:grid-cols-2">
        {OPTIONS.map((o) => {
          const selected = source === o.value;
          const Icon = o.icon;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setSource(o.value)}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/50"
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                  selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-sm font-medium">{o.title}</span>
                <span className="block text-xs text-muted-foreground">{o.description}</span>
              </span>
            </button>
          );
        })}
      </div>

      {source === "web_app" && (
        <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          Someone seen at a device who didn&apos;t clock in shows as <strong>present, not clocked in</strong> in Team
          Today, History and Reports (status <strong>P</strong>), so you can follow up. Remote staff clock in from
          anywhere as usual. Applies from the day you switch — earlier days are unchanged.
          {settings.timekeepingSource === "web_app" && settings.timekeepingFrom && (
            <> In effect since {new Date(`${settings.timekeepingFrom}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.</>
          )}
        </p>
      )}

      <button
        onClick={save}
        disabled={!dirty || saving}
        className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
      >
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
