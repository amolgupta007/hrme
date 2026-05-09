"use client";

import { useState, useTransition } from "react";
import { Video, Phone, MapPin, CheckCircle2, Clock3 } from "lucide-react";
import { toast } from "sonner";
import { submitInterviewFeedback, type MyInterview } from "@/actions/hire";

interface Props {
  upcoming: MyInterview[];
  past: MyInterview[];
}

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  video: Video,
  phone: Phone,
  in_person: MapPin,
};

export function MyInterviewsClient({ upcoming, past }: Props) {
  const [active, setActive] = useState<MyInterview | null>(null);

  return (
    <>
      <Section title="Upcoming" empty="No upcoming interviews scheduled for you." items={upcoming} onSelect={setActive} />
      <Section title="Past" empty="No past interviews yet." items={past} onSelect={setActive} variant="past" />
      {active && <FeedbackModal interview={active} onClose={() => setActive(null)} />}
    </>
  );
}

function Section({
  title,
  empty,
  items,
  onSelect,
  variant = "upcoming",
}: {
  title: string;
  empty: string;
  items: MyInterview[];
  onSelect: (i: MyInterview) => void;
  variant?: "upcoming" | "past";
}) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">{empty}</div>
      ) : (
        <ul className="space-y-2">
          {items.map((i) => (
            <Row key={i.schedule_id} interview={i} onSelect={() => onSelect(i)} variant={variant} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ interview, onSelect, variant }: { interview: MyInterview; onSelect: () => void; variant: "upcoming" | "past" }) {
  const Icon = TYPE_ICON[interview.type] ?? Video;
  const when = new Date(interview.scheduled_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {interview.candidate_name} <span className="text-muted-foreground">·</span> {interview.job_title}
        </p>
        <p className="text-xs text-muted-foreground">
          {when}
          {interview.duration_minutes ? ` · ${interview.duration_minutes} min` : ""}
          {" · "}
          <span className="capitalize">{interview.type.replace("_", " ")}</span>
        </p>
      </div>
      {interview.feedback_submitted ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5" /> Feedback in
        </span>
      ) : variant === "past" ? (
        <button
          onClick={onSelect}
          className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
        >
          Submit feedback
        </button>
      ) : (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          <Clock3 className="h-3.5 w-3.5" /> Upcoming
        </span>
      )}
    </li>
  );
}

const RECOMMENDATIONS = [
  { value: "strong_yes", label: "Strong Yes" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "strong_no", label: "Strong No" },
] as const;

function FeedbackModal({ interview, onClose }: { interview: MyInterview; onClose: () => void }) {
  const [technical, setTechnical] = useState(0);
  const [communication, setCommunication] = useState(0);
  const [cultureFit, setCultureFit] = useState(0);
  const [overall, setOverall] = useState(0);
  const [recommendation, setRecommendation] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  const ready = technical && communication && cultureFit && overall && recommendation;

  const handleSubmit = () => {
    if (!ready) return;
    startTransition(async () => {
      const res = await submitInterviewFeedback({
        schedule_id: interview.schedule_id,
        technical_rating: technical,
        communication_rating: communication,
        culture_fit_rating: cultureFit,
        overall_rating: overall,
        recommendation: recommendation as "strong_yes" | "yes" | "no" | "strong_no",
        notes,
      });
      if (res.success) {
        toast.success("Feedback submitted");
        onClose();
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg bg-background p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 text-base font-semibold text-foreground">Interview feedback</h3>
        <p className="mb-4 text-xs text-muted-foreground">
          {interview.candidate_name} · {interview.job_title}
        </p>

        <div className="space-y-4">
          <RatingRow label="Technical" value={technical} onChange={setTechnical} />
          <RatingRow label="Communication" value={communication} onChange={setCommunication} />
          <RatingRow label="Culture fit" value={cultureFit} onChange={setCultureFit} />
          <RatingRow label="Overall" value={overall} onChange={setOverall} />

          <div>
            <p className="mb-1.5 text-xs font-semibold text-foreground">Recommendation</p>
            <div className="grid grid-cols-2 gap-1.5">
              {RECOMMENDATIONS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRecommendation(r.value)}
                  className={
                    recommendation === r.value
                      ? "rounded-md border-2 border-indigo-600 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950"
                      : "rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:border-indigo-300"
                  }
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold text-foreground">Notes</p>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What stood out? Any concerns?"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border bg-card px-3 py-1.5 text-sm">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!ready || pending}
            className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {pending ? "Submitting…" : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RatingRow({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-foreground">{label}</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => onChange(n)}
            className={
              value >= n
                ? "h-7 w-7 rounded text-sm font-semibold text-amber-500 hover:text-amber-600"
                : "h-7 w-7 rounded text-sm text-muted-foreground hover:text-amber-400"
            }
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}
