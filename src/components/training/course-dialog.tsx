"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Label from "@radix-ui/react-label";
import { X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { createCourse, updateCourse } from "@/actions/training";
import type { Course } from "@/actions/training";

const inputCn =
  "flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";

const CATEGORIES = [
  { value: "ethics", label: "Ethics" },
  { value: "compliance", label: "Compliance" },
  { value: "safety", label: "Safety" },
  { value: "skills", label: "Skills" },
  { value: "onboarding", label: "Onboarding" },
  { value: "custom", label: "Custom" },
] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: Course;
}

export function CourseDialog({ open, onOpenChange, editing }: Props) {
  const [title, setTitle] = React.useState(editing?.title ?? "");
  const [description, setDescription] = React.useState(editing?.description ?? "");
  const [category, setCategory] = React.useState<Course["category"]>(editing?.category ?? "compliance");
  const [contentUrl, setContentUrl] = React.useState(editing?.content_url ?? "");
  const [durationMinutes, setDurationMinutes] = React.useState(
    editing?.duration_minutes ? String(editing.duration_minutes) : ""
  );
  const [isMandatory, setIsMandatory] = React.useState(editing?.is_mandatory ?? false);
  const [dueDate, setDueDate] = React.useState(editing?.due_date ?? "");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setTitle(editing?.title ?? "");
      setDescription(editing?.description ?? "");
      setCategory(editing?.category ?? "compliance");
      setContentUrl(editing?.content_url ?? "");
      setDurationMinutes(editing?.duration_minutes ? String(editing.duration_minutes) : "");
      setIsMandatory(editing?.is_mandatory ?? false);
      setDueDate(editing?.due_date ?? "");
    }
  }, [open, editing]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const payload = {
      title,
      description: description || undefined,
      category,
      content_url: contentUrl || undefined,
      duration_minutes: durationMinutes ? parseInt(durationMinutes) : null,
      is_mandatory: isMandatory,
      due_date: dueDate || null,
    };

    const result = editing
      ? await updateCourse(editing.id, payload)
      : await createCourse(payload);

    setLoading(false);
    if (result.success) {
      toast.success(editing ? "Course updated" : "Course created");
      onOpenChange(false);
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl bg-background p-6 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-5">
            <Dialog.Title className="text-lg font-semibold">
              {editing ? "Edit Course" : "New Course"}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon"><X className="h-4 w-4" /></Button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label.Root className="text-sm font-medium">Title <span className="text-destructive">*</span></Label.Root>
              <input
                className={cn(inputCn, "h-10")}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Annual Data Privacy Training"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label.Root className="text-sm font-medium">Description</Label.Root>
              <textarea
                className={cn(inputCn, "min-h-[80px] resize-none")}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What will employees learn?"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label.Root className="text-sm font-medium">Category <span className="text-destructive">*</span></Label.Root>
                <select
                  className={cn(inputCn, "h-10")}
                  value={category}
                  onChange={(e) => setCategory(e.target.value as Course["category"])}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label.Root className="text-sm font-medium">Duration (minutes)</Label.Root>
                <input
                  type="number"
                  min="1"
                  className={cn(inputCn, "h-10")}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  placeholder="60"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label.Root className="text-sm font-medium">Content URL</Label.Root>
              <input
                type="url"
                className={cn(inputCn, "h-10")}
                value={contentUrl}
                onChange={(e) => setContentUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label.Root className="text-sm font-medium">Due Date</Label.Root>
                <input
                  type="date"
                  className={cn(inputCn, "h-10")}
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input accent-primary"
                    checked={isMandatory}
                    onChange={(e) => setIsMandatory(e.target.checked)}
                  />
                  <span className="text-sm font-medium">Mandatory</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <Dialog.Close asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </Dialog.Close>
              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : editing ? "Save Changes" : "Create Course"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
