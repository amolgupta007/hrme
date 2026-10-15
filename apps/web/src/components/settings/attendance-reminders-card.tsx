"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BellRing, Loader2, Search, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  getAttendanceReminderSettings,
  updateAttendanceReminderSettings,
  type ReminderEmployeeOption,
} from "@/actions/attendance-reminders";
import { formatReminderTime, type AttendanceReminderSettings } from "@jambahr/shared/attendance/reminders";

const same = (a: AttendanceReminderSettings, b: AttendanceReminderSettings) =>
  JSON.stringify({ ...a, excludedEmployeeIds: [...a.excludedEmployeeIds].sort() }) ===
  JSON.stringify({ ...b, excludedEmployeeIds: [...b.excludedEmployeeIds].sort() });

/** Settings → Attendance → Clock-in & clock-out reminders. Loads its own state. */
export function AttendanceRemindersCard() {
  const [saved, setSaved] = useState<AttendanceReminderSettings | null>(null);
  const [form, setForm] = useState<AttendanceReminderSettings | null>(null);
  const [employees, setEmployees] = useState<ReminderEmployeeOption[]>([]);
  const [attendanceEnabled, setAttendanceEnabled] = useState(true);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getAttendanceReminderSettings().then((r) => {
      if (!r.success) return;
      setSaved(r.data.settings);
      setForm(r.data.settings);
      setEmployees(r.data.employees);
      setAttendanceEnabled(r.data.attendanceEnabled);
    });
  }, []);

  const excluded = useMemo(() => new Set(form?.excludedEmployeeIds ?? []), [form]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? employees.filter((e) => e.name.toLowerCase().includes(q)) : employees;
  }, [employees, query]);

  if (!form || !saved) {
    return (
      <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading reminders…
      </div>
    );
  }

  const dirty = !same(form, saved);
  const set = (patch: Partial<AttendanceReminderSettings>) => setForm({ ...form, ...patch });
  const toggleExcluded = (id: string) =>
    set({
      excludedEmployeeIds: excluded.has(id)
        ? form.excludedEmployeeIds.filter((x) => x !== id)
        : [...form.excludedEmployeeIds, id],
    });

  async function save() {
    if (!form) return;
    setSaving(true);
    const res = await updateAttendanceReminderSettings(form);
    setSaving(false);
    if (!res.success) return void toast.error(res.error);
    setSaved(res.data);
    setForm(res.data);
    toast.success(res.data.enabled ? "Reminders saved" : "Reminders are off");
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <BellRing className="h-4 w-4" />
          </span>
          <div>
            <h3 className="font-semibold">Clock-in &amp; clock-out reminders</h3>
            <p className="text-sm text-muted-foreground">
              Remind people who haven&apos;t clocked in by a set time, and people still clocked in at
              the end of the day. Week-offs, holidays and approved leave days are skipped.
            </p>
          </div>
        </div>
        <Switch
          checked={form.enabled}
          onCheckedChange={(v) => set({ enabled: v })}
          aria-label="Enable clock-in and clock-out reminders"
        />
      </div>

      {!attendanceEnabled && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          Attendance is switched off for this organisation, so no reminders will be sent.
        </p>
      )}

      {form.enabled && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <ReminderRow
              title="Clock-in reminder"
              help="Sent to anyone who hasn't clocked in by this time on a working day."
              enabled={form.clockIn.enabled}
              time={form.clockIn.time}
              onEnabled={(v) => set({ clockIn: { ...form.clockIn, enabled: v } })}
              onTime={(t) => set({ clockIn: { ...form.clockIn, time: t } })}
            />
            <ReminderRow
              title="Clock-out reminder"
              help="Sent to anyone who is still clocked in at this time."
              enabled={form.clockOut.enabled}
              time={form.clockOut.time}
              onEnabled={(v) => set({ clockOut: { ...form.clockOut, enabled: v } })}
              onTime={(t) => set({ clockOut: { ...form.clockOut, time: t } })}
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Send as</legend>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input accent-primary"
                  checked={form.email}
                  onChange={(e) => set({ email: e.target.checked })}
                />
                Email
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input accent-primary"
                  checked={form.inApp}
                  onChange={(e) => set({ inApp: e.target.checked })}
                />
                In-app (notifications bell and mobile app)
              </label>
            </div>
          </fieldset>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-medium">Don&apos;t remind</p>
              <p className="text-xs text-muted-foreground">
                {excluded.size === 0 ? "Everyone is reminded" : `${excluded.size} excluded`}
              </p>
            </div>
            {excluded.size > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {employees
                  .filter((e) => excluded.has(e.id))
                  .map((e) => (
                    <span key={e.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                      {e.name}
                      <button
                        type="button"
                        onClick={() => toggleExcluded(e.id)}
                        className="rounded-full text-muted-foreground hover:text-foreground"
                        aria-label={`Remind ${e.name} again`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
              </div>
            )}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search employees"
                className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm"
              />
            </div>
            <div className="max-h-48 overflow-y-auto rounded-md border">
              {visible.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">No employees match.</p>
              ) : (
                visible.map((e) => (
                  <label key={e.id} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/50">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-input accent-primary"
                      checked={excluded.has(e.id)}
                      onChange={() => toggleExcluded(e.id)}
                    />
                    <span className="flex-1">{e.name}</span>
                    {e.department && <span className="text-xs text-muted-foreground">{e.department}</span>}
                  </label>
                ))
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              For people who don&apos;t clock in here — for example staff on another company&apos;s payroll.
            </p>
          </div>

          <p className="text-xs text-muted-foreground">
            Times are India time (IST). A reminder missed during an outage is still sent for up to an
            hour afterwards, never later.
          </p>
        </div>
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

function ReminderRow({
  title,
  help,
  enabled,
  time,
  onEnabled,
  onTime,
}: {
  title: string;
  help: string;
  enabled: boolean;
  time: string;
  onEnabled: (v: boolean) => void;
  onTime: (t: string) => void;
}) {
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        <Switch checked={enabled} onCheckedChange={onEnabled} aria-label={title} />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="time"
          step={300}
          value={time}
          disabled={!enabled}
          onChange={(e) => e.target.value && onTime(e.target.value.slice(0, 5))}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
          aria-label={`${title} time`}
        />
        {enabled && <span className="text-xs text-muted-foreground">{formatReminderTime(time)}</span>}
      </div>
      <p className="text-xs text-muted-foreground">{help}</p>
    </div>
  );
}
