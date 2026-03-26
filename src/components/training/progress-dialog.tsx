"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Label from "@radix-ui/react-label";
import { X, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { updateProgress } from "@/actions/training";
import type { Enrollment } from "@/actions/training";

const inputCn =
  "flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";

const STATUS_OPTIONS = [
  { value: "assigned", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "overdue", label: "Overdue" },
] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enrollment: Enrollment;
}

export function ProgressDialog({ open, onOpenChange, enrollment }: Props) {
  const [progress, setProgress] = React.useState(enrollment.progress_percent);
  const [status, setStatus] = React.useState(enrollment.status);
  const [certificateUrl, setCertificateUrl] = React.useState(enrollment.certificate_url ?? "");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setProgress(enrollment.progress_percent);
      setStatus(enrollment.status);
      setCertificateUrl(enrollment.certificate_url ?? "");
    }
  }, [open, enrollment]);

  // Auto-set status based on progress
  function handleProgressChange(val: number) {
    setProgress(val);
    if (val === 100 && status !== "completed") setStatus("completed");
    else if (val > 0 && val < 100 && status === "assigned") setStatus("in_progress");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const result = await updateProgress(enrollment.id, {
      progress_percent: progress,
      status,
      certificate_url: certificateUrl || null,
    });
    setLoading(false);
    if (result.success) {
      toast.success("Progress updated");
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
            <Dialog.Title className="text-lg font-semibold">Update Progress</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon"><X className="h-4 w-4" /></Button>
            </Dialog.Close>
          </div>
          <p className="text-sm text-muted-foreground mb-5">{enrollment.course_title}</p>

          {enrollment.course_content_url && (
            <a
              href={enrollment.course_content_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-primary hover:underline mb-4"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open course material
            </a>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Progress slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label.Root className="text-sm font-medium">Progress</Label.Root>
                <span className="text-sm font-semibold tabular-nums">{progress}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={progress}
                onChange={(e) => handleProgressChange(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    progress === 100 ? "bg-green-500" : "bg-primary"
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <Label.Root className="text-sm font-medium">Status</Label.Root>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStatus(opt.value)}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium border transition-colors",
                      status === opt.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-input hover:border-primary/50"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Certificate URL — shown when completed */}
            {status === "completed" && (
              <div className="space-y-1.5">
                <Label.Root className="text-sm font-medium">Certificate URL</Label.Root>
                <input
                  type="url"
                  className={cn(inputCn, "h-10")}
                  value={certificateUrl}
                  onChange={(e) => setCertificateUrl(e.target.value)}
                  placeholder="https://... (optional)"
                />
              </div>
            )}

            <div className="flex justify-end gap-3 pt-1">
              <Dialog.Close asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </Dialog.Close>
              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : "Save Progress"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
