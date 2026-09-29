"use client";

import * as React from "react";
import { Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MarkdownView } from "@/components/documents/markdown-view";
import { AudienceSelect } from "@/components/announcements/audience-select";
import {
  createAnnouncement,
  getAnnouncementAudienceOptions,
  updateAnnouncement,
  type Announcement,
  type AnnouncementAudienceOptions,
} from "@/actions/announcements";
import { ANNOUNCEMENT_CATEGORIES, CATEGORY_META, type AnnouncementCategoryKey } from "@/lib/announcements/categories";
import { isContentChanged, type AudienceTarget, type AudienceType } from "@/lib/announcements/ack-status";

const TITLE_MAX = 200;

type FormState = {
  title: string;
  body: string;
  category: AnnouncementCategoryKey;
  is_pinned: boolean;
  audience_type: AudienceType;
  targets: AudienceTarget[];
  ack_required: boolean;
  ack_due_date: string;
};

function initialState(a: Announcement | null): FormState {
  return {
    title: a?.title ?? "",
    body: a?.body ?? "",
    category: (a?.category as AnnouncementCategoryKey) ?? "general",
    is_pinned: a?.is_pinned ?? false,
    audience_type: a?.audience_type ?? "all",
    targets: a?.targets.map(({ target_type, target_id }) => ({ target_type, target_id })) ?? [],
    ack_required: a?.ack_required ?? false,
    ack_due_date: a?.ack_due_date ?? "",
  };
}

function todayIst(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

interface ComposerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Announcement | null;
}

export function ComposerDialog({ open, onOpenChange, editing }: ComposerDialogProps) {
  const [form, setForm] = React.useState<FormState>(() => initialState(editing));
  const [tab, setTab] = React.useState<"write" | "preview">("write");
  const [options, setOptions] = React.useState<AnnouncementAudienceOptions | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [reackPromptOpen, setReackPromptOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setForm(initialState(editing));
    setTab("write");
    if (!options) {
      getAnnouncementAudienceOptions().then((r) => {
        if (r.success) setOptions(r.data);
        else toast.error(r.error);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const audienceLocked = !!editing?.ack_required;
  const acknowledgedCount = editing?.ack_totals?.acknowledged ?? 0;
  const contentChanged = !!editing && isContentChanged(editing, form);

  function validate(): string | null {
    if (!form.title.trim()) return "Title is required";
    if (form.title.length > TITLE_MAX) return "Title is too long";
    if (!form.body.trim()) return "Body is required";
    if (form.audience_type === "targeted" && form.targets.length === 0 && !audienceLocked) {
      return "Pick at least one department or employee, or choose Everyone";
    }
    if (form.ack_required && form.ack_due_date && form.ack_due_date < todayIst() && form.ack_due_date !== editing?.ack_due_date) {
      return "Due date can't be in the past";
    }
    return null;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) return void toast.error(err);
    // Material edit of an announcement people already acknowledged → ask first.
    if (editing && editing.ack_required && form.ack_required && contentChanged && acknowledgedCount > 0) {
      setReackPromptOpen(true);
      return;
    }
    void save(true);
  }

  async function save(requireReack: boolean) {
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      body: form.body.trim(),
      category: form.category,
      is_pinned: form.is_pinned,
      audience_type: form.audience_type,
      targets: form.audience_type === "targeted" ? form.targets : [],
      ack_required: form.ack_required,
      ack_due_date: form.ack_required && form.ack_due_date ? form.ack_due_date : null,
    };
    const result = editing
      ? await updateAnnouncement(editing.id, payload, { requireReack })
      : await createAnnouncement(payload);
    setSaving(false);
    setReackPromptOpen(false);
    if (!result.success) return void toast.error(result.error);

    if (!editing) toast.success(form.ack_required ? "Posted — recipients asked to acknowledge" : "Announcement posted");
    else if ("reackTriggered" in (result.data ?? {}) && (result.data as any).reackTriggered)
      toast.success("Updated — everyone has been asked to acknowledge again");
    else toast.success("Announcement updated");
    onOpenChange(false);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
        <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1rem)] max-w-2xl flex-col p-0">
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <DialogHeader className="mb-0 border-b border-border px-5 py-4 sm:px-6">
              <DialogTitle>{editing ? "Edit announcement" : "New announcement"}</DialogTitle>
              <DialogDescription>
                {editing ? "Changes are visible to everyone in the audience." : "Share an update with your team."}
              </DialogDescription>
            </DialogHeader>

            <div className="scroll-thin min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
              <div className="grid gap-4 sm:grid-cols-[1fr_11rem]">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="ann-title">Title</Label>
                    <span
                      className={cn(
                        "text-xs tabular-nums text-muted-foreground",
                        form.title.length > TITLE_MAX && "text-destructive"
                      )}
                    >
                      {form.title.length}/{TITLE_MAX}
                    </span>
                  </div>
                  <Input
                    id="ann-title"
                    value={form.title}
                    onChange={(e) => set("title", e.target.value)}
                    placeholder="e.g. Office closed on Monday"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={(v) => set("category", v as AnnouncementCategoryKey)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ANNOUNCEMENT_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {CATEGORY_META[c].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="ann-body">Message</Label>
                  <div className="inline-flex rounded-md border border-border p-0.5 text-xs" role="tablist">
                    {(["write", "preview"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        role="tab"
                        aria-selected={tab === t}
                        onClick={() => setTab(t)}
                        className={cn(
                          "rounded px-2.5 py-1 font-medium capitalize transition-colors",
                          tab === t ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                {tab === "write" ? (
                  <>
                    <Textarea
                      id="ann-body"
                      value={form.body}
                      onChange={(e) => set("body", e.target.value)}
                      rows={8}
                      placeholder="Write your announcement…"
                      className="min-h-[10rem] resize-y"
                    />
                    <p className="text-xs text-muted-foreground">
                      Supports <strong>**bold**</strong>, <em>*italic*</em>, # headings and - lists. Leave a
                      blank line between paragraphs.
                    </p>
                  </>
                ) : (
                  <div className="min-h-[10rem] rounded-md border border-border bg-muted/20 p-4">
                    {form.body.trim() ? (
                      <MarkdownView markdown={form.body} />
                    ) : (
                      <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Audience</Label>
                <AudienceSelect
                  options={options}
                  audienceType={form.audience_type}
                  targets={form.targets}
                  locked={audienceLocked}
                  onChange={(n) => setForm((f) => ({ ...f, audience_type: n.audienceType, targets: n.targets }))}
                />
              </div>

              <div className="divide-y divide-border rounded-lg border border-border">
                <ToggleRow
                  id="ann-pin"
                  title="Pin to top"
                  description="Pinned announcements stay above the rest."
                  checked={form.is_pinned}
                  onCheckedChange={(v) => set("is_pinned", v)}
                />
                <div>
                  <ToggleRow
                    id="ann-ack"
                    title="Require acknowledgement"
                    description="Each recipient must confirm they have read it. You can track who has."
                    checked={form.ack_required}
                    onCheckedChange={(v) => set("ack_required", v)}
                    icon={<ShieldCheck className="h-4 w-4 text-primary" />}
                  />
                  {form.ack_required && (
                    <div className="flex flex-col gap-1.5 px-4 pb-4 sm:flex-row sm:items-center sm:gap-3">
                      <Label htmlFor="ann-due" className="text-sm font-normal text-muted-foreground">
                        Due date <span className="text-xs">(optional)</span>
                      </Label>
                      <Input
                        id="ann-due"
                        type="date"
                        min={todayIst()}
                        value={form.ack_due_date}
                        onChange={(e) => set("ack_due_date", e.target.value)}
                        className="h-9 sm:w-44"
                      />
                      {form.ack_due_date && (
                        <button
                          type="button"
                          onClick={() => set("ack_due_date", "")}
                          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <DialogFooter className="mt-0 gap-2 border-t border-border px-5 py-3 sm:px-6">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editing ? "Save changes" : "Post announcement"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={reackPromptOpen} onOpenChange={(o) => !saving && setReackPromptOpen(o)}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Ask everyone to acknowledge again?</DialogTitle>
            <DialogDescription>
              {acknowledgedCount} {acknowledgedCount === 1 ? "person has" : "people have"} already acknowledged
              this announcement. If this change matters, their acknowledgement resets to pending. Their earlier
              acknowledgement stays on record against the previous version.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Button onClick={() => save(true)} disabled={saving} className="justify-start">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
              Yes, require re-acknowledgement
            </Button>
            <Button variant="outline" onClick={() => save(false)} disabled={saving} className="justify-start">
              No, it&apos;s a minor fix — keep acknowledgements
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ToggleRow(props: {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 p-4">
      <div className="flex gap-2.5">
        {props.icon && <span className="mt-0.5">{props.icon}</span>}
        <div>
          <Label htmlFor={props.id} className="cursor-pointer">
            {props.title}
          </Label>
          <p className="text-xs text-muted-foreground">{props.description}</p>
        </div>
      </div>
      <Switch id={props.id} checked={props.checked} onCheckedChange={props.onCheckedChange} />
    </div>
  );
}
