"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Clock, LogIn, LogOut, Users, CheckCircle, Timer, Calendar } from "lucide-react";
import { clockIn, clockOut, listAttendance } from "@/actions/attendance";
import type { AttendanceRecord, TodayStatus } from "@/actions/attendance";
import type { Employee } from "@/types";

interface Props {
  today: TodayStatus | null;
  history: AttendanceRecord[];
  team: { present: number; absent: number; total: number; records: AttendanceRecord[] } | null;
  employees: Employee[];
  isManager: boolean;
  attendancePayrollEnabled: boolean;
}

function formatTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function formatDuration(minutes: number | null) {
  if (!minutes) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

export function AttendanceClient({ today, history, team, employees, isManager, attendancePayrollEnabled }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [liveTime, setLiveTime] = useState("");
  const [activeTab, setActiveTab] = useState<"my" | "team">(isManager ? "team" : "my");
  const [filterEmployee, setFilterEmployee] = useState("");
  const [filteredHistory, setFilteredHistory] = useState<AttendanceRecord[]>(history);

  const isClockedIn = today?.isClockedIn ?? false;
  const clockInTime = today?.record?.clock_in_at ?? null;

  // Live elapsed timer
  useEffect(() => {
    if (!isClockedIn || !clockInTime) { setLiveTime(""); return; }
    const update = () => {
      const elapsed = Math.floor((Date.now() - new Date(clockInTime).getTime()) / 1000);
      const h = Math.floor(elapsed / 3600);
      const m = Math.floor((elapsed % 3600) / 60);
      const s = elapsed % 60;
      setLiveTime(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [isClockedIn, clockInTime]);

  async function handleClockIn() {
    setLoading(true);
    try {
      const result = await clockIn();
      if (result.success) { toast.success("Clocked in successfully"); router.refresh(); }
      else toast.error(result.error);
    } finally { setLoading(false); }
  }

  async function handleClockOut() {
    setLoading(true);
    try {
      const result = await clockOut();
      if (result.success) {
        const mins = result.data.total_minutes;
        toast.success(`Clocked out — ${formatDuration(mins)} logged`);
        router.refresh();
      } else toast.error(result.error);
    } finally { setLoading(false); }
  }

  async function handleFilterEmployee(empId: string) {
    setFilterEmployee(empId);
    if (!empId) { setFilteredHistory(history); return; }
    const result = await listAttendance({
      employeeId: empId,
      from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    });
    if (result.success) setFilteredHistory(result.data);
    else toast.error(result.error);
  }

  const todayDate = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">Attendance</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{todayDate}</p>
      </div>

      {/* Clock in/out card */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Today&apos;s Status</p>
            {!today?.record ? (
              <p className="text-2xl font-bold text-foreground">Not clocked in</p>
            ) : isClockedIn ? (
              <div>
                <p className="text-2xl font-bold text-primary font-mono">{liveTime || "—"}</p>
                <p className="text-sm text-muted-foreground mt-1">Clocked in at {formatTime(clockInTime)}</p>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-emerald-500" />
                  <p className="text-2xl font-bold text-foreground">{formatDuration(today.record.total_minutes)}</p>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {formatTime(today.record.clock_in_at)} → {formatTime(today.record.clock_out_at)}
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {!today?.record || (!isClockedIn && !today.record.clock_out_at) ? (
              <button
                onClick={handleClockIn}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-60 transition-all"
              >
                <LogIn className="h-4 w-4" />
                Clock In
              </button>
            ) : isClockedIn ? (
              <button
                onClick={handleClockOut}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg bg-destructive px-6 py-3 text-sm font-semibold text-destructive-foreground shadow-sm hover:bg-destructive/90 disabled:opacity-60 transition-all"
              >
                <LogOut className="h-4 w-4" />
                Clock Out
              </button>
            ) : (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                <CheckCircle className="h-4 w-4" />
                Attendance complete
              </div>
            )}
          </div>
        </div>

        {/* Stats row */}
        {today?.record && (
          <div className="mt-5 grid grid-cols-3 gap-4 border-t border-border pt-4">
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Clock In</p>
              <p className="text-sm font-semibold">{formatTime(today.record.clock_in_at)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Clock Out</p>
              <p className="text-sm font-semibold">{formatTime(today.record.clock_out_at)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Hours Logged</p>
              <p className="text-sm font-semibold">{formatDuration(today.record.total_minutes)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Manager team overview */}
      {isManager && team && (
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "Present Today", value: team.present, icon: <CheckCircle className="h-5 w-5 text-emerald-500" />, color: "bg-emerald-50 dark:bg-emerald-950/40" },
            { label: "Not Clocked In", value: team.absent, icon: <Clock className="h-5 w-5 text-amber-500" />, color: "bg-amber-50 dark:bg-amber-950/40" },
            { label: "Total Employees", value: team.total, icon: <Users className="h-5 w-5 text-primary" />, color: "bg-primary/5" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-border bg-card p-5 flex items-center gap-4">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${stat.color}`}>
                {stat.icon}
              </div>
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      {isManager && (
        <div className="flex gap-1 border-b border-border">
          {[{ label: "Team Today", value: "team" }, { label: "My History", value: "my" }].map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value as "my" | "team")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.value
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Team today tab */}
      {activeTab === "team" && isManager && team && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <p className="text-sm font-semibold">Today&apos;s Attendance</p>
          </div>
          {team.records.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <Clock className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No one has clocked in yet today.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {team.records.map((rec) => (
                <div key={rec.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium">{rec.employee_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      In: {formatTime(rec.clock_in_at)}
                      {rec.clock_out_at ? ` · Out: ${formatTime(rec.clock_out_at)}` : " · Still in"}
                    </p>
                  </div>
                  <div className="text-right">
                    {rec.total_minutes ? (
                      <span className="text-sm font-semibold text-foreground">{formatDuration(rec.total_minutes)}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        <Timer className="h-3 w-3" /> Active
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* My history tab */}
      {(activeTab === "my" || !isManager) && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold">Last 30 Days</p>
            </div>
            {isManager && (
              <select
                className="text-sm rounded-lg border border-input bg-background px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
                value={filterEmployee}
                onChange={(e) => handleFilterEmployee(e.target.value)}
              >
                <option value="">My records</option>
                {employees.map((emp: any) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {filteredHistory.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <Clock className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No attendance records yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredHistory.map((rec) => (
                <div key={rec.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium">{formatDate(rec.date)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatTime(rec.clock_in_at)} → {formatTime(rec.clock_out_at)}
                    </p>
                  </div>
                  <div className="text-right">
                    {rec.total_minutes ? (
                      <span className={`text-sm font-semibold ${rec.total_minutes >= 480 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                        {formatDuration(rec.total_minutes)}
                      </span>
                    ) : rec.clock_in_at && !rec.clock_out_at ? (
                      <span className="text-xs text-primary font-medium">In progress</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {attendancePayrollEnabled && (
        <p className="text-xs text-muted-foreground text-center">
          Overtime hours from attendance are included in monthly payroll runs.
        </p>
      )}
    </div>
  );
}
