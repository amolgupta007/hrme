"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Home, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { getWfhPolicy, updateWfhPolicy } from "@/actions/wfh";
import type { WfhPolicy } from "@jambahr/shared/attendance/wfh";

/** Settings → Attendance → Work from home. Loads its own state. */
export function WfhPolicyCard() {
  const [saved, setSaved] = useState<WfhPolicy | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [allowance, setAllowance] = useState("2");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getWfhPolicy().then((r) => {
      if (!r.success) return;
      setSaved(r.data);
      setEnabled(r.data.enabled);
      setAllowance(String(r.data.monthlyAllowance));
    });
  }, []);

  const dirty = !!saved && (enabled !== saved.enabled || Number(allowance) !== saved.monthlyAllowance);

  async function save() {
    setSaving(true);
    const res = await updateWfhPolicy({ enabled, monthlyAllowance: Number(allowance) });
    setSaving(false);
    if (!res.success) return void toast.error(res.error);
    setSaved(res.data);
    toast.success(res.data.enabled ? "Work-from-home requests are on" : "Work-from-home requests are off");
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Home className="h-4 w-4" />
          </span>
          <div>
            <h3 className="font-semibold">Work from home</h3>
            <p className="text-sm text-muted-foreground">
              Office employees request work-from-home days in advance; their reporting manager
              approves. A WFH day is a working day — they still clock in, and lateness applies.
            </p>
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!saved} aria-label="Enable work-from-home requests" />
      </div>

      {enabled && (
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="wfh-allowance">
            WFH days per month (office employees)
          </label>
          <input
            id="wfh-allowance"
            type="number"
            min={0}
            max={31}
            value={allowance}
            onChange={(e) => setAllowance(e.target.value)}
            className="h-9 w-24 rounded-md border border-input bg-background px-3 text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Employees can still ask for more; days beyond this need an admin&apos;s approval.
            Employees marked <strong>Remote</strong> (Employees → Edit → Work arrangement) never need to ask.
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
