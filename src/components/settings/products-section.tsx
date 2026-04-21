"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Briefcase, Clock, Wallet, ExternalLink, MessageSquareWarning } from "lucide-react";
import { toggleJambaHire, toggleAttendance, toggleAttendancePayroll, toggleGrievances } from "@/actions/settings";
import { useRouter } from "next/navigation";

interface Props {
  jambaHireEnabled: boolean;
  isPlanEligible: boolean;
  attendanceEnabled: boolean;
  attendancePayrollEnabled: boolean;
  grievancesEnabled: boolean;
}

function Toggle({ enabled, onChange, disabled }: { enabled: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
        enabled ? "bg-indigo-600" : "bg-muted"
      }`}
      role="switch"
      aria-checked={enabled}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ${
          enabled ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export function ProductsSection({ jambaHireEnabled, isPlanEligible, attendanceEnabled, attendancePayrollEnabled, grievancesEnabled }: Props) {
  const [jhEnabled, setJhEnabled] = useState(jambaHireEnabled);
  const [attEnabled, setAttEnabled] = useState(attendanceEnabled);
  const [attPayrollEnabled, setAttPayrollEnabled] = useState(attendancePayrollEnabled);
  const [grvEnabled, setGrvEnabled] = useState(grievancesEnabled);
  const [loading, setLoading] = useState<string | null>(null);
  const router = useRouter();

  async function handleJambaHire() {
    if (!isPlanEligible) { toast.error("JambaHire requires the Business plan"); return; }
    setLoading("jambahire");
    const next = !jhEnabled;
    try {
      const result = await toggleJambaHire(next);
      if (result.success) { setJhEnabled(next); toast.success(next ? "JambaHire enabled" : "JambaHire disabled"); router.refresh(); }
      else toast.error(result.error);
    } finally { setLoading(null); }
  }

  async function handleAttendance() {
    setLoading("attendance");
    const next = !attEnabled;
    try {
      const result = await toggleAttendance(next);
      if (result.success) {
        setAttEnabled(next);
        if (!next) setAttPayrollEnabled(false);
        toast.success(next ? "Attendance module enabled" : "Attendance module disabled");
        router.refresh();
      } else toast.error(result.error);
    } finally { setLoading(null); }
  }

  async function handleAttendancePayroll() {
    if (!attEnabled) { toast.error("Enable attendance first"); return; }
    setLoading("att-payroll");
    const next = !attPayrollEnabled;
    try {
      const result = await toggleAttendancePayroll(next);
      if (result.success) {
        setAttPayrollEnabled(next);
        toast.success(next ? "Payroll integration enabled" : "Payroll integration disabled");
      } else toast.error(result.error);
    } finally { setLoading(null); }
  }

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold mb-1">Products & Features</h2>
      <p className="text-sm text-muted-foreground mb-5">
        Enable optional modules for your organization. Changes take effect immediately.
      </p>

      <div className="space-y-3">

        {/* JambaHire */}
        <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-950">
              <Briefcase className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-sm">JambaHire</p>
                {!isPlanEligible && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400">Business plan</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                Full hiring suite — job postings, candidate pipeline, interviews, and offer letters.
              </p>
              {jhEnabled && (
                <a href="/hire" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                  Open JambaHire <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
          <Toggle enabled={jhEnabled} onChange={handleJambaHire} disabled={loading === "jambahire" || !isPlanEligible} />
        </div>

        {/* Attendance */}
        <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-950">
              <Clock className="h-5 w-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <p className="font-semibold text-sm">Attendance</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Web-based clock in/out for your team. Track daily attendance, hours worked, and late arrivals.
              </p>
              {attEnabled && (
                <a href="/dashboard/attendance" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-teal-600 hover:underline dark:text-teal-400">
                  View Attendance <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
          <Toggle enabled={attEnabled} onChange={handleAttendance} disabled={loading === "attendance"} />
        </div>

        {/* Grievances & Feedback */}
        <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-100 dark:bg-rose-950">
              <MessageSquareWarning className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div>
              <p className="font-semibold text-sm">Grievances & Feedback</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Anonymous complaint and suggestion box. Employees raise issues; admins track and resolve them privately.
              </p>
              {grvEnabled && (
                <a href="/dashboard/grievances" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:underline dark:text-rose-400">
                  View Grievances <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
          <Toggle
            enabled={grvEnabled}
            onChange={async () => {
              setLoading("grievances");
              const next = !grvEnabled;
              try {
                const result = await toggleGrievances(next);
                if (result.success) { setGrvEnabled(next); toast.success(next ? "Grievances enabled" : "Grievances disabled"); router.refresh(); }
                else toast.error(result.error);
              } finally { setLoading(null); }
            }}
            disabled={loading === "grievances"}
          />
        </div>

        {/* Attendance → Payroll integration (only visible when attendance is on) */}
        {attEnabled && (
          <div className="flex items-start justify-between gap-4 rounded-lg border border-dashed border-border bg-muted/30 p-4 ml-6">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-950">
                <Wallet className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p className="font-semibold text-sm">Payroll Integration</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Automatically calculate overtime from attendance records and include it in monthly payroll runs.
                </p>
              </div>
            </div>
            <Toggle enabled={attPayrollEnabled} onChange={handleAttendancePayroll} disabled={loading === "att-payroll"} />
          </div>
        )}

      </div>
    </div>
  );
}
