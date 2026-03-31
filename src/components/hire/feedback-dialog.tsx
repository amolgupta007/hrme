"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { submitInterviewFeedback } from "@/actions/hire";
import type { InterviewSchedule } from "@/actions/hire";

interface Props {
  open: boolean;
  onClose: () => void;
  interview: InterviewSchedule;
}

const RECOMMENDATIONS = [
  { value: "strong_yes", label: "Strong Yes", color: "border-green-400 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300" },
  { value: "yes", label: "Yes", color: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  { value: "no", label: "No", color: "border-orange-300 bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300" },
  { value: "strong_no", label: "Strong No", color: "border-red-400 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300" },
];

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button key={star} type="button" onClick={() => onChange(star)}>
          <Star className={`h-5 w-5 ${star <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
        </button>
      ))}
    </div>
  );
}

export function FeedbackDialog({ open, onClose, interview }: Props) {
  const existing = interview.feedback;
  const [technical, setTechnical] = useState(existing?.technical_rating ?? 0);
  const [communication, setCommunication] = useState(existing?.communication_rating ?? 0);
  const [cultureFit, setCultureFit] = useState(existing?.culture_fit_rating ?? 0);
  const [overall, setOverall] = useState(existing?.overall_rating ?? 0);
  const [recommendation, setRecommendation] = useState<string>(existing?.recommendation ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!recommendation) return toast.error("Select a recommendation");
    if (!overall) return toast.error("Give an overall rating");

    setSaving(true);
    try {
      const result = await submitInterviewFeedback({
        schedule_id: interview.id,
        technical_rating: technical || 3,
        communication_rating: communication || 3,
        culture_fit_rating: cultureFit || 3,
        overall_rating: overall,
        recommendation: recommendation as any,
        notes,
      });
      if (result.success) {
        toast.success("Feedback submitted");
        onClose();
      } else {
        toast.error(result.error);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Interview Feedback</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-1">
          {interview.candidate_name} · {interview.job_title}
        </p>

        <div className="space-y-5 mt-2">
          {/* Ratings */}
          {[
            { label: "Technical Skills", value: technical, onChange: setTechnical },
            { label: "Communication", value: communication, onChange: setCommunication },
            { label: "Culture Fit", value: cultureFit, onChange: setCultureFit },
            { label: "Overall", value: overall, onChange: setOverall },
          ].map((r) => (
            <div key={r.label} className="flex items-center justify-between">
              <span className="text-sm font-medium">{r.label}</span>
              <StarRating value={r.value} onChange={r.onChange} />
            </div>
          ))}

          {/* Recommendation */}
          <div>
            <p className="text-sm font-medium mb-2">Recommendation *</p>
            <div className="flex gap-2 flex-wrap">
              {RECOMMENDATIONS.map((rec) => (
                <button
                  key={rec.value}
                  type="button"
                  onClick={() => setRecommendation(rec.value)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    recommendation === rec.value ? rec.color : "border-border hover:bg-muted"
                  }`}
                >
                  {rec.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-medium">Notes</label>
            <textarea
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-none focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              placeholder="Observations, strengths, concerns…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              {saving ? "Saving…" : existing ? "Update Feedback" : "Submit Feedback"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
