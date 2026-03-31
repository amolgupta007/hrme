"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Video, Phone, Building2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CalendarLinks } from "./calendar-links";
import { scheduleInterview } from "@/actions/hire";
import type { Application } from "@/actions/hire";

interface Employee { id: string; first_name: string; last_name: string; }

interface Props {
  open: boolean;
  onClose: () => void;
  applications: Application[];
  employees: Employee[];
  preselectedAppId?: string;
}

const TYPE_OPTIONS = [
  { value: "video", label: "Video Call", icon: Video },
  { value: "phone", label: "Phone", icon: Phone },
  { value: "in_person", label: "In Person", icon: Building2 },
];

export function ScheduleInterviewDialog({ open, onClose, applications, employees, preselectedAppId }: Props) {
  const [appId, setAppId] = useState(preselectedAppId ?? "");
  const [interviewerId, setInterviewerId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [duration, setDuration] = useState(60);
  const [interviewType, setInterviewType] = useState<"video" | "phone" | "in_person">("video");
  const [meetingLink, setMeetingLink] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [scheduled, setScheduled] = useState<{ at: string; duration: number; title: string; link: string } | null>(null);

  const inputCls = "mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400";

  async function handleSave() {
    if (!appId) return toast.error("Select a candidate");
    if (!scheduledAt) return toast.error("Select date and time");

    setSaving(true);
    try {
      const result = await scheduleInterview({
        application_id: appId,
        interviewer_id: interviewerId || undefined,
        scheduled_at: new Date(scheduledAt).toISOString(),
        duration_minutes: duration,
        interview_type: interviewType,
        meeting_link: meetingLink || undefined,
        notes: notes || undefined,
      });

      if (result.success) {
        toast.success("Interview scheduled");
        const app = applications.find((a) => a.id === appId);
        setScheduled({
          at: scheduledAt,
          duration,
          title: `Interview — ${app?.candidate_name ?? "Candidate"} for ${app?.job_title ?? ""}`,
          link: meetingLink,
        });
      } else {
        toast.error(result.error);
      }
    } finally {
      setSaving(false);
    }
  }

  if (scheduled) {
    const event = {
      title: scheduled.title,
      description: `JambaHire interview.\n${scheduled.link ? `Meeting link: ${scheduled.link}` : ""}${notes ? `\n\nNotes: ${notes}` : ""}`,
      location: scheduled.link || undefined,
      startAt: new Date(scheduled.at),
      durationMinutes: scheduled.duration,
    };

    return (
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Interview Scheduled</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">
              Interview set for{" "}
              <strong>{new Date(scheduled.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</strong>{" "}
              ({scheduled.duration} min)
            </p>
            <CalendarLinks event={event} />
            <div className="flex justify-end pt-2">
              <Button onClick={onClose} className="bg-indigo-600 hover:bg-indigo-700 text-white">Done</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule Interview</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Candidate */}
          <div>
            <label className="text-sm font-medium">Candidate *</label>
            <select className={inputCls} value={appId} onChange={(e) => setAppId(e.target.value)} disabled={!!preselectedAppId}>
              <option value="">Select candidate…</option>
              {applications.filter((a) => a.stage !== "hired" && a.stage !== "rejected").map((a) => (
                <option key={a.id} value={a.id}>
                  {a.candidate_name} — {a.job_title}
                </option>
              ))}
            </select>
          </div>

          {/* Interviewer */}
          <div>
            <label className="text-sm font-medium">Interviewer</label>
            <select className={inputCls} value={interviewerId} onChange={(e) => setInterviewerId(e.target.value)}>
              <option value="">Select interviewer…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>
              ))}
            </select>
          </div>

          {/* Date + Duration */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Date & Time *</label>
              <input type="datetime-local" className={inputCls} value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Duration</label>
              <select className={inputCls} value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                <option value={30}>30 minutes</option>
                <option value={45}>45 minutes</option>
                <option value={60}>60 minutes</option>
                <option value={90}>90 minutes</option>
                <option value={120}>2 hours</option>
              </select>
            </div>
          </div>

          {/* Type */}
          <div>
            <label className="text-sm font-medium">Interview Type</label>
            <div className="flex gap-2 mt-1">
              {TYPE_OPTIONS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setInterviewType(t.value as any)}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    interviewType === t.value
                      ? "border-indigo-400 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  <t.icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Meeting link */}
          {interviewType !== "in_person" && (
            <div>
              <label className="text-sm font-medium">Meeting Link</label>
              <input className={inputCls} placeholder="https://meet.google.com/…" value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)} />
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-sm font-medium">Agenda / Notes</label>
            <textarea className={`${inputCls} min-h-[60px] resize-none`} placeholder="Topics to cover, interview focus areas…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              {saving ? "Scheduling…" : "Schedule Interview"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
