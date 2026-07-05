"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Label from "@radix-ui/react-label";
import { X, ExternalLink, Award, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { updateProgress } from "@/actions/training";
import type { Enrollment } from "@/actions/training";

const inputCn =
  "flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enrollment: Enrollment;
}

export function ProgressDialog({ open, onOpenChange, enrollment }: Props) {
  const [progress, setProgress] = React.useState(enrollment.progress_percent);
  const [certificateUrl, setCertificateUrl] = React.useState(enrollment.certificate_url ?? "");
  const [attested, setAttested] = React.useState(false);
  const [loadingProgress, setLoadingProgress] = React.useState(false);
  const [loadingComplete, setLoadingComplete] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setProgress(enrollment.progress_percent);
      setCertificateUrl(enrollment.certificate_url ?? "");
      setAttested(false);
    }
  }, [open, enrollment]);

  async function handleSaveProgress() {
    setLoadingProgress(true);
    const result = await updateProgress(enrollment.id, {
      progress_percent: progress,
      status: progress > 0 ? "in_progress" : "assigned",
      certificate_url: null,
    });
    setLoadingProgress(false);
    if (result.success) {
      toast.success("Progress saved");
      onOpenChange(false);
    } else {
      toast.error(result.error);
    }
  }

  async function handleMarkComplete() {
    if (!attested) {
      toast.error("Please confirm you have completed this course");
      return;
    }
    if (enrollment.course_is_mandatory && !certificateUrl.trim()) {
      toast.error("Certificate URL is required for mandatory courses");
      return;
    }
    setLoadingComplete(true);
    const result = await updateProgress(enrollment.id, {
      progress_percent: 100,
      status: "completed",
      certificate_url: certificateUrl.trim() || null,
    });
    setLoadingComplete(false);
    if (result.success) {
      toast.success("Course marked as completed");
      onOpenChange(false);
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-background p-6 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="flex items-center justify-between mb-1">
            <Dialog.Title className="text-lg font-semibold">Course Progress</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon"><X className="h-4 w-4" /></Button>
            </Dialog.Close>
          </div>
          <p className="text-sm text-muted-foreground mb-5">{enrollment.course_title}</p>

          {/* Open course link */}
          {enrollment.course_content_url && (
            <a
              href={enrollment.course_content_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-primary hover:underline mb-5"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open course material
            </a>
          )}

          <div className="space-y-5">
            {/* ---- Section 1: Self-reported progress ---- */}
            <div className="rounded-lg border border-border p-4 space-y-3">
              <p className="text-sm font-medium">Track your progress</p>
              <p className="text-xs text-muted-foreground">
                Use the slider to log how far along you are. This is for your own tracking — it does not mark the course as complete.
              </p>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-semibold tabular-nums">{progress}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="95"
                  step="5"
                  value={Math.min(progress, 95)}
                  onChange={(e) => setProgress(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={handleSaveProgress}
                disabled={loadingProgress}
              >
                {loadingProgress ? "Saving..." : "Save Progress"}
              </Button>
            </div>

            {/* ---- Section 2: Mark as complete ---- */}
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <p className="text-sm font-medium">Mark as Complete</p>
              </div>

              {/* Attestation checkbox */}
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-input accent-primary shrink-0"
                  checked={attested}
                  onChange={(e) => setAttested(e.target.checked)}
                />
                <span className="text-sm text-muted-foreground">
                  I confirm that I have fully completed{" "}
                  <span className="font-medium text-foreground">{enrollment.course_title}</span>{" "}
                  and understood its content.
                </span>
              </label>

              {/* Certificate URL */}
              <div className="space-y-1.5">
                <Label.Root className="text-xs font-medium flex items-center gap-1">
                  <Award className="h-3.5 w-3.5 text-amber-500" />
                  Certificate URL
                  {enrollment.course_is_mandatory ? (
                    <span className="text-destructive ml-0.5">* required</span>
                  ) : (
                    <span className="text-muted-foreground font-normal ml-0.5">optional</span>
                  )}
                </Label.Root>
                <input
                  type="url"
                  className={cn(inputCn, "h-9 text-sm")}
                  value={certificateUrl}
                  onChange={(e) => setCertificateUrl(e.target.value)}
                  placeholder="Paste your certificate link here..."
                />
                <p className="text-xs text-muted-foreground">
                  Copy the shareable link from your course platform (e.g. Coursera, LinkedIn Learning, Google Classroom).
                </p>
              </div>

              <Button
                type="button"
                className="w-full"
                onClick={handleMarkComplete}
                disabled={loadingComplete || !attested}
              >
                {loadingComplete ? "Submitting..." : "Mark as Complete"}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
