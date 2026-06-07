"use client";

import * as React from "react";
import { toast } from "sonner";
import { Zap, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  updateOvertimeSettings,
  computeAndRecordOvertime,
} from "@/actions/overtime";
import type { OvertimeSettings } from "@/lib/attendance/overtime-types";

interface Props {
  settings: OvertimeSettings;
}

function defaultWeekRange(): { from: string; to: string } {
  const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const dayOfWeek = now.getUTCDay() || 7;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - (dayOfWeek - 1));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { from: monday.toISOString().slice(0, 10), to: sunday.toISOString().slice(0, 10) };
}

export function OvertimeCard({ settings }: Props) {
  const [enabled, setEnabled] = React.useState(settings.enabled);
  const [multiplier, setMultiplier] = React.useState(String(settings.multiplier));
  const [thresholdMode, setThresholdMode] = React.useState<"per_day" | "weekly">(
    settings.threshold_mode,
  );
  const [weeklyHours, setWeeklyHours] = React.useState(String(settings.weekly_threshold_hours));
  const [approvalRequired, setApprovalRequired] = React.useState(settings.approval_required);
  const [saving, setSaving] = React.useState(false);
  const [computing, setComputing] = React.useState(false);

  async function handleSave() {
    setSaving(true);
    const r = await updateOvertimeSettings({
      enabled,
      multiplier: Number(multiplier),
      threshold_mode: thresholdMode,
      weekly_threshold_hours: Number(weeklyHours),
      approval_required: approvalRequired,
    });
    setSaving(false);
    if (!r.success) {
      toast.error(r.error);
      return;
    }
    toast.success("Overtime settings saved");
  }

  async function handleComputeThisWeek() {
    if (!enabled) {
      toast.error("Enable overtime first");
      return;
    }
    const { from, to } = defaultWeekRange();
    setComputing(true);
    const r = await computeAndRecordOvertime({ from, to });
    setComputing(false);
    if (!r.success) {
      toast.error(r.error);
      return;
    }
    toast.success(`Computed: ${r.data.inserted} inserted, ${r.data.skipped} skipped`);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="rounded-lg bg-amber-100 dark:bg-amber-950 p-2 shrink-0">
          <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        </div>
        <p className="text-sm font-semibold">Overtime</p>
      </div>

      <label className="flex items-center justify-between text-sm">
        <span>
          <span className="font-medium">Enable Overtime tracking</span>
          <span className="block text-xs text-muted-foreground mt-0.5">
            OT is OFF by default. Turn on to compute, approve, and push to payroll.
          </span>
        </span>
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
      </label>

      {enabled && (
        <div className="space-y-3 pl-2 border-l-2 border-amber-200 dark:border-amber-900">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <label className="block">
              <span className="block text-xs text-muted-foreground mb-1">Multiplier (e.g. 1.5x)</span>
              <input
                type="number"
                min={1}
                max={5}
                step={0.1}
                value={multiplier}
                onChange={(e) => setMultiplier(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5"
              />
            </label>
            <label className="block">
              <span className="block text-xs text-muted-foreground mb-1">Threshold mode</span>
              <select
                value={thresholdMode}
                onChange={(e) => setThresholdMode(e.target.value as "per_day" | "weekly")}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5"
              >
                <option value="per_day">Per-day (worked &gt; shift hours)</option>
                <option value="weekly">Weekly (worked &gt; threshold hours)</option>
              </select>
            </label>
            {thresholdMode === "weekly" && (
              <label className="block">
                <span className="block text-xs text-muted-foreground mb-1">
                  Weekly threshold (hours)
                </span>
                <input
                  type="number"
                  min={20}
                  max={80}
                  step={1}
                  value={weeklyHours}
                  onChange={(e) => setWeeklyHours(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5"
                />
              </label>
            )}
            <label className="flex items-center gap-2 text-sm col-span-2">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={approvalRequired}
                onChange={(e) => setApprovalRequired(e.target.checked)}
              />
              <span>
                <span className="font-medium">Require admin approval</span>
                <span className="block text-xs text-muted-foreground">
                  When off, computed OT goes straight to &quot;approved&quot; status.
                </span>
              </span>
            </label>
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save settings"}
            </Button>
            <Button size="sm" variant="ghost" onClick={handleComputeThisWeek} disabled={computing}>
              <Sparkles className="h-3.5 w-3.5 mr-1" />
              {computing ? "Computing…" : "Compute OT for this week"}
            </Button>
          </div>
        </div>
      )}

      {!enabled && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-xs text-muted-foreground">
            Save with the toggle on to configure multiplier / threshold / approval.
          </p>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      )}
    </div>
  );
}
