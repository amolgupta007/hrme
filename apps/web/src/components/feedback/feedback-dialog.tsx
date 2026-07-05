"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { useFeedback } from "./feedback-context";
import { submitFeedback, uploadFeedbackScreenshot } from "@/actions/feedback";
import type { FeedbackType, FeedbackSeverity } from "@/types";

const TYPE_OPTIONS: { value: FeedbackType; label: string; emoji: string }[] = [
  { value: "bug", label: "Bug", emoji: "🐛" },
  { value: "feature_request", label: "Feature", emoji: "✨" },
  { value: "feedback", label: "Feedback", emoji: "💬" },
  { value: "other", label: "Other", emoji: "📝" },
];

const SEVERITY_OPTIONS: { value: FeedbackSeverity; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

export function FeedbackDialog() {
  const { open, closeDialog } = useFeedback();
  const pathname = usePathname();
  const [type, setType] = useState<FeedbackType>("bug");
  const [severity, setSeverity] = useState<FeedbackSeverity>("medium");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pageUrlSnapshot, setPageUrlSnapshot] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Snapshot pathname when dialog opens; reset state when it closes
  useEffect(() => {
    if (open) {
      setPageUrlSnapshot(pathname);
      return;
    }
    setType("bug");
    setSeverity("medium");
    setTitle("");
    setDescription("");
    setScreenshot(null);
  }, [open, pathname]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    if (!title.trim()) return toast.error("Title is required");
    if (!description.trim()) return toast.error("Description is required");

    setSubmitting(true);

    let screenshotPath: string | null = null;
    if (screenshot) {
      if (screenshot.size > MAX_SCREENSHOT_BYTES) {
        toast.error("Screenshot must be 5MB or smaller");
        setSubmitting(false);
        return;
      }
      const formData = new FormData();
      formData.append("file", screenshot);
      const uploadResult = await uploadFeedbackScreenshot(formData);
      if (!uploadResult.success) {
        toast.error(`Screenshot upload failed: ${uploadResult.error}`);
        setSubmitting(false);
        return;
      }
      screenshotPath = uploadResult.data.path;
    }

    const result = await submitFeedback({
      type,
      title: title.trim(),
      description: description.trim(),
      severity: type === "bug" ? severity : null,
      pageUrl: pageUrlSnapshot,
      userAgent: navigator.userAgent.slice(0, 512),
      screenshotPath,
    });

    setSubmitting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Thanks — we got it. Track it under My Feedback.");
    closeDialog();
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => (v ? null : closeDialog())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[95vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background shadow-lg flex flex-col max-h-[90vh]">
          <div className="flex items-center justify-between border-b px-6 pt-6 pb-4 shrink-0">
            <Dialog.Title className="text-lg font-semibold">Send feedback</Dialog.Title>
            <Dialog.Close className="rounded-md p-1 hover:bg-muted">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
            <div>
              <label className="text-sm font-medium">Type</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setType(opt.value)}
                    className={`rounded-md border px-3 py-1.5 text-sm ${
                      type === opt.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted"
                    }`}
                  >
                    {opt.emoji} {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {type === "bug" ? (
              <div>
                <label className="text-sm font-medium" htmlFor="feedback-severity">Severity</label>
                <select
                  id="feedback-severity"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as FeedbackSeverity)}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  {SEVERITY_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            ) : null}

            <div>
              <label className="text-sm font-medium" htmlFor="feedback-title">Title</label>
              <input
                id="feedback-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                required
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="One-line summary"
              />
              <p className="mt-1 text-xs text-muted-foreground">{title.length}/120</p>
            </div>

            <div>
              <label className="text-sm font-medium" htmlFor="feedback-description">Description</label>
              <textarea
                id="feedback-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
                required
                rows={6}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="What happened? What did you expect?"
              />
              <p className="mt-1 text-xs text-muted-foreground">{description.length}/2000</p>
            </div>

            <div>
              <label className="text-sm font-medium">Screenshot (optional)</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => setScreenshot(e.target.files?.[0] ?? null)}
                className="mt-1 block w-full text-sm"
              />
              {screenshot ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Selected: {screenshot.name} ({Math.round(screenshot.size / 1024)} KB)
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">PNG or JPG, ≤5MB</p>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Auto-captured: page URL, browser, your role.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t shrink-0">
              <Button type="button" variant="outline" onClick={closeDialog} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Send feedback
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
