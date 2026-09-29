"use client";

import * as React from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MarkdownView } from "@/components/documents/markdown-view";
import { acknowledgeAnnouncement, type Announcement } from "@/actions/announcements";

interface AcknowledgeDialogProps {
  announcement: Announcement | null;
  onOpenChange: (open: boolean) => void;
  onAcknowledged: (id: string, acknowledgedAt: string) => void;
}

export function AcknowledgeDialog({ announcement, onOpenChange, onAcknowledged }: AcknowledgeDialogProps) {
  const [confirmed, setConfirmed] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => setConfirmed(false), [announcement?.id]);

  async function submit() {
    if (!announcement || !confirmed || saving) return;
    setSaving(true);
    const res = await acknowledgeAnnouncement(announcement.id);
    setSaving(false);
    if (!res.success) return void toast.error(res.error);
    onAcknowledged(announcement.id, res.data.acknowledged_at);
    toast.success("Acknowledged — thank you");
    onOpenChange(false);
  }

  return (
    <Dialog open={!!announcement} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1rem)] max-w-xl flex-col">
        <DialogHeader>
          <DialogTitle className="pr-6">{announcement?.title}</DialogTitle>
          <DialogDescription>Please read the announcement below, then confirm.</DialogDescription>
        </DialogHeader>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto rounded-md border border-border bg-muted/20 p-4">
          {announcement && <MarkdownView markdown={announcement.body} />}
        </div>

        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm hover:bg-muted/40">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-input accent-[hsl(var(--primary))]"
          />
          <span>I have read and acknowledge this announcement.</span>
        </label>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Not now
          </Button>
          <Button onClick={submit} disabled={!confirmed || saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
            Acknowledge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
