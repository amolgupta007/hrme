"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Label from "@radix-ui/react-label";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createHoliday, updateHoliday, type HolidayRow } from "@/actions/holidays";

const inputCn =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: HolidayRow | null;
  anchorYear: number;
  onSaved: () => void;
};

export function HolidayDialog({ open, onOpenChange, editing, anchorYear, onSaved }: Props) {
  const [name, setName] = React.useState("");
  const [date, setDate] = React.useState("");
  const [isOptional, setIsOptional] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setDate(editing?.date ?? "");
    setIsOptional(editing?.is_optional ?? false);
  }, [open, editing]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const input = { name, date, isOptional };
    const res = editing ? await updateHoliday(editing.id, input) : await createHoliday(input);
    setSaving(false);
    if (!res.success) return void toast.error(res.error);
    toast.success(editing ? "Holiday updated" : "Holiday added");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-background p-6 shadow-lg">
          <div className="mb-5 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold">{editing ? "Edit holiday" : "Add holiday"}</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close"><X className="h-4 w-4" /></Button>
            </Dialog.Close>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label.Root htmlFor="holiday-name" className="text-sm font-medium">Name</Label.Root>
              <input id="holiday-name" className={inputCn} value={name} maxLength={80}
                onChange={(e) => setName(e.target.value)} placeholder="e.g. Diwali" required />
            </div>
            <div className="space-y-1.5">
              <Label.Root htmlFor="holiday-date" className="text-sm font-medium">Date</Label.Root>
              <input id="holiday-date" type="date" className={inputCn} value={date}
                min={`${anchorYear - 1}-01-01`} max={`${anchorYear + 1}-12-31`}
                onChange={(e) => setDate(e.target.value)} required />
            </div>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={isOptional}
                onChange={(e) => setIsOptional(e.target.checked)} />
              <span>
                <span className="font-medium">Optional holiday</span>
                <span className="block text-muted-foreground">Shown on the calendar, but a normal working day unless someone takes it.</span>
              </span>
            </label>
            {editing && editing.date < new Date().toISOString().slice(0, 10) && (
              <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                This date has passed. Reports update now, late marks for this month re-count overnight, and locked payroll runs don&apos;t change.
              </p>
            )}
            <div className="flex justify-end gap-3 pt-1">
              <Dialog.Close asChild><Button type="button" variant="outline">Cancel</Button></Dialog.Close>
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Add holiday"}</Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
