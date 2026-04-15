"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, CalendarDays, Video, Phone, Building2, MessageSquare, CheckCircle2, XCircle, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScheduleInterviewDialog } from "./schedule-interview-dialog";
import { FeedbackDialog } from "./feedback-dialog";
import { CalendarLinks } from "./calendar-links";
import { updateInterviewStatus, rescheduleInterview } from "@/actions/hire";
import type { InterviewSchedule, Application } from "@/actions/hire";

const TYPE_ICON: Record<string, any> = { video: Video, phone: Phone, in_person: Building2 };
const TYPE_LABEL: Record<string, string> = { video: "Video", phone: "Phone", in_person: "In Person" };

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  no_show: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

const RECOMMENDATION_LABELS: Record<string, string> = {
  strong_yes: "Strong Yes", yes: "Yes", no: "No", strong_no: "Strong No",
};
const RECOMMENDATION_COLORS: Record<string, string> = {
  strong_yes: "text-green-700 dark:text-green-400",
  yes: "text-emerald-700 dark:text-emerald-400",
  no: "text-orange-700 dark:text-orange-400",
  strong_no: "text-red-700 dark:text-red-400",
};

interface Props {
  interviews: InterviewSchedule[];
  applications: Application[];
  employees: { id: string; first_name: string; last_name: string }[];
  isAdmin: boolean;
}

export function InterviewsClient({ interviews, applications, employees, isAdmin }: Props) {
  const router = useRouter();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [feedbackInterview, setFeedbackInterview] = useState<InterviewSchedule | null>(null);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [rescheduling, setRescheduling] = useState<InterviewSchedule | null>(null);
  const [rescheduleData, setRescheduleData] = useState({
    scheduled_at: "",
    interview_type: "video" as "video" | "phone" | "in_person",
    meeting_link: "",
  });
  const [rescheduleSaving, setRescheduleSaving] = useState(false);

  const now = new Date();
  const upcoming = interviews.filter((i) => new Date(i.scheduled_at) >= now && i.status === "scheduled");
  const past = interviews.filter((i) => new Date(i.scheduled_at) < now || i.status !== "scheduled");

  const displayed = tab === "upcoming" ? upcoming : past;

  async function handleReschedule() {
    if (!rescheduling || !rescheduleData.scheduled_at) return toast.error("Select a date and time");
    setRescheduleSaving(true);
    const result = await rescheduleInterview(rescheduling.id, {
      scheduled_at: new Date(rescheduleData.scheduled_at).toISOString(),
      interview_type: rescheduleData.interview_type,
      meeting_link: rescheduleData.meeting_link || undefined,
    });
    setRescheduleSaving(false);
    if (result.success) {
      toast.success("Interview rescheduled");
      setRescheduling(null);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function handleStatusChange(id: string, status: "completed" | "cancelled" | "no_show") {
    const result = await updateInterviewStatus(id, status);
    if (result.success) {
      toast.success(`Marked as ${status.replace("_", " ")}`);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Interviews</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {upcoming.length} upcoming · {past.length} past
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setScheduleOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            <Plus className="h-4 w-4 mr-1.5" /> Schedule Interview
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-indigo-100 dark:border-indigo-900/40">
        {(["upcoming", "past"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 capitalize transition-colors ${
              tab === t
                ? "border-indigo-600 text-indigo-700 dark:text-indigo-300"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t} <span className="ml-1 text-xs text-muted-foreground">({t === "upcoming" ? upcoming.length : past.length})</span>
          </button>
        ))}
      </div>

      {/* List */}
      {displayed.length === 0 ? (
        <div className="rounded-xl border border-dashed border-indigo-200 dark:border-indigo-900/40 p-12 text-center">
          <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">No {tab} interviews</p>
          {tab === "upcoming" && isAdmin && (
            <p className="text-xs text-muted-foreground mt-1">Click &quot;Schedule Interview&quot; to set one up.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map((interview) => {
            const TypeIcon = TYPE_ICON[interview.interview_type] ?? Video;
            const calEvent = {
              title: `Interview — ${interview.candidate_name} for ${interview.job_title}`,
              description: `Interviewer: ${interview.interviewer_name ?? "TBD"}\n${interview.notes ?? ""}`,
              location: interview.meeting_link ?? undefined,
              startAt: new Date(interview.scheduled_at),
              durationMinutes: interview.duration_minutes,
            };

            return (
              <div key={interview.id} className="rounded-xl border border-indigo-100 bg-white p-5 dark:border-indigo-900/40 dark:bg-[#150e2b] space-y-3">
                {/* Top row */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{interview.candidate_name}</p>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[interview.status]}`}>
                        {interview.status.replace("_", " ")}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{interview.job_title}</p>
                  </div>

                  <div className="text-right text-xs text-muted-foreground shrink-0">
                    <p className="font-medium text-foreground">
                      {new Date(interview.scheduled_at).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                    </p>
                    <p>{new Date(interview.scheduled_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} · {interview.duration_minutes} min</p>
                  </div>
                </div>

                {/* Meta */}
                <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1"><TypeIcon className="h-3.5 w-3.5" />{TYPE_LABEL[interview.interview_type]}</span>
                  {interview.interviewer_name && <span>Interviewer: {interview.interviewer_name}</span>}
                  {interview.meeting_link && (
                    <a href={interview.meeting_link} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline dark:text-indigo-400">Join meeting</a>
                  )}
                </div>

                {/* Feedback summary */}
                {interview.feedback && (
                  <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs space-y-1">
                    <div className="flex items-center gap-2">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      <span className="font-medium">Overall: {interview.feedback.overall_rating}/5</span>
                      {interview.feedback.recommendation && (
                        <span className={`font-semibold ${RECOMMENDATION_COLORS[interview.feedback.recommendation]}`}>
                          · {RECOMMENDATION_LABELS[interview.feedback.recommendation]}
                        </span>
                      )}
                    </div>
                    {interview.feedback.notes && <p className="text-muted-foreground">{interview.feedback.notes}</p>}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  {interview.status === "scheduled" && (
                    <CalendarLinks event={calEvent} />
                  )}
                  {interview.status === "scheduled" && isAdmin && (
                    <>
                      <button
                        onClick={() => handleStatusChange(interview.id, "completed")}
                        className="flex items-center gap-1 rounded-md border border-green-200 px-2 py-1 text-xs text-green-700 hover:bg-green-50 dark:border-green-900 dark:text-green-400"
                      >
                        <CheckCircle2 className="h-3 w-3" /> Mark Done
                      </button>
                      <button
                        onClick={() => handleStatusChange(interview.id, "no_show")}
                        className="flex items-center gap-1 rounded-md border border-orange-200 px-2 py-1 text-xs text-orange-700 hover:bg-orange-50 dark:border-orange-900 dark:text-orange-400"
                      >
                        No Show
                      </button>
                      <button
                        onClick={() => handleStatusChange(interview.id, "cancelled")}
                        className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                      >
                        <XCircle className="h-3 w-3" /> Cancel
                      </button>
                      <button
                        onClick={() => {
                          setRescheduling(interview);
                          setRescheduleData({
                            scheduled_at: interview.scheduled_at.slice(0, 16),
                            interview_type: interview.interview_type as "video" | "phone" | "in_person",
                            meeting_link: interview.meeting_link ?? "",
                          });
                        }}
                        className="flex items-center gap-1 rounded-md border border-indigo-200 px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-400"
                      >
                        Reschedule
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setFeedbackInterview(interview)}
                    className="flex items-center gap-1 rounded-md border border-indigo-200 px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-400"
                  >
                    <MessageSquare className="h-3 w-3" />
                    {interview.feedback ? "Edit Feedback" : "Add Feedback"}
                  </button>
                </div>

                {rescheduling?.id === interview.id && (
                  <div className="border-t border-border pt-3 space-y-3">
                    <p className="text-xs font-semibold">Reschedule Interview</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium">New Date &amp; Time *</label>
                        <input
                          type="datetime-local"
                          className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          value={rescheduleData.scheduled_at}
                          onChange={(e) => setRescheduleData((d) => ({ ...d, scheduled_at: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium">Type</label>
                        <select
                          className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          value={rescheduleData.interview_type}
                          onChange={(e) => setRescheduleData((d) => ({ ...d, interview_type: e.target.value as "video" | "phone" | "in_person" }))}
                        >
                          <option value="video">Video</option>
                          <option value="phone">Phone</option>
                          <option value="in_person">In Person</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium">Meeting Link</label>
                      <input
                        className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                        placeholder="https://meet.google.com/..."
                        value={rescheduleData.meeting_link}
                        onChange={(e) => setRescheduleData((d) => ({ ...d, meeting_link: e.target.value }))}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleReschedule}
                        disabled={rescheduleSaving}
                        className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                      >
                        {rescheduleSaving ? "Saving…" : "Confirm Reschedule"}
                      </button>
                      <button
                        onClick={() => setRescheduling(null)}
                        className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {scheduleOpen && (
        <ScheduleInterviewDialog
          open={scheduleOpen}
          onClose={() => { setScheduleOpen(false); router.refresh(); }}
          applications={applications}
          employees={employees}
        />
      )}

      {feedbackInterview && (
        <FeedbackDialog
          open={!!feedbackInterview}
          onClose={() => { setFeedbackInterview(null); router.refresh(); }}
          interview={feedbackInterview}
        />
      )}
    </div>
  );
}
