"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { getHolidayPreset, importHolidays } from "@/actions/holidays";
import { istToday } from "@jambahr/shared/attendance/ist";
import { PRESET_REGION_LABELS, presetRegionsFor, type HolidayRegion } from "@jambahr/shared/holidays/presets";
import { parseHolidayCsv, presetToDrafts, restrictToYear, type HolidayDraft } from "@jambahr/shared/holidays/import";

type Item = HolidayDraft & { key: string; selected: boolean; alreadyAdded: boolean; note?: string };
type Mode = "preset" | "csv";

const fmt = (iso: string) =>
  new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function HolidayImportDialog({ open, onOpenChange, year, onImported }: {
  open: boolean; onOpenChange: (o: boolean) => void; year: number; onImported: () => void;
}) {
  const regions = presetRegionsFor(year);
  const [mode, setMode] = React.useState<Mode>(regions.length ? "preset" : "csv");
  const [region, setRegion] = React.useState<HolidayRegion | null>(regions[0] ?? null);
  const [items, setItems] = React.useState<Item[]>([]);
  const [csvErrors, setCsvErrors] = React.useState<{ line: number; message: string }[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setMode(regions.length ? "preset" : "csv");
    setRegion(regions[0] ?? null);
    setItems([]);
    setCsvErrors([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, year]);

  React.useEffect(() => {
    if (!open || mode !== "preset" || !region) return;
    let cancelled = false;
    setLoading(true);
    getHolidayPreset(year, region).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (!res.success) return void toast.error(res.error);
      const today = istToday();
      const drafts = presetToDrafts(res.data);
      setItems(res.data.map((p, i) => ({
        ...drafts[i],
        key: `${p.date}|${p.name}`,
        alreadyAdded: p.alreadyAdded,
        selected: !p.alreadyAdded && p.kind !== "restricted" && p.date >= today,
        note: p.kind === "restricted" ? "Restricted" : undefined,
      })));
    });
    return () => { cancelled = true; setLoading(false); };
  }, [open, mode, region, year]);

  async function onFile(file: File) {
    const { drafts, errors } = restrictToYear(parseHolidayCsv(await file.text()), year);
    setCsvErrors(errors);
    setItems(drafts.map((d, i) => ({ ...d, key: `${i}|${d.date}`, selected: true, alreadyAdded: false })));
  }

  const toggle = (key: string, patch: Partial<Item>) =>
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  const chosen = items.filter((i) => i.selected && !i.alreadyAdded);
  const anyPast = chosen.some((i) => i.date < istToday());

  async function submit() {
    setSaving(true);
    const res = await importHolidays(chosen.map(({ name, date, isOptional }) => ({ name, date, isOptional })), mode);
    setSaving(false);
    if (!res.success) return void toast.error(res.error);
    const { added, skipped } = res.data;
    toast.success(skipped.length
      ? `Added ${added} holiday${added === 1 ? "" : "s"}; ${skipped.length} date${skipped.length === 1 ? " was" : "s were"} already on your calendar`
      : `Added ${added} holiday${added === 1 ? "" : "s"}`);
    onOpenChange(false);
    onImported();
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl bg-background p-6 shadow-lg">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold">Import {year} holidays</Dialog.Title>
            <Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Close"><X className="h-4 w-4" /></Button></Dialog.Close>
          </div>

          <div className="mb-4 flex flex-wrap gap-2" role="tablist">
            {regions.map((r) => (
              <Button key={r} size="sm" variant={mode === "preset" && region === r ? "default" : "outline"}
                onClick={() => { setMode("preset"); setRegion(r); setCsvErrors([]); }}>
                {PRESET_REGION_LABELS[r]}
              </Button>
            ))}
            <Button size="sm" variant={mode === "csv" ? "default" : "outline"} onClick={() => { setMode("csv"); setItems([]); }}>
              Upload CSV
            </Button>
          </div>

          {mode === "csv" && (
            <div className="mb-3 space-y-2 text-sm">
              <p className="text-muted-foreground">
                Columns: <code>name,date,optional</code>. Dates as 2026-11-08 or 08/11/2026; optional as yes or no.
              </p>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2">
                <Upload className="h-4 w-4" /> Choose a .csv file
                <input type="file" accept=".csv,text/csv" className="sr-only"
                  onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
              </label>
              {csvErrors.length > 0 && (
                <ul className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
                  {csvErrors.map((er) => <li key={er.line}>Line {er.line}: {er.message}</li>)}
                </ul>
              )}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
            {loading ? (
              <p className="p-4 text-sm text-muted-foreground">Loading…</p>
            ) : items.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">{mode === "csv" ? "No rows yet." : "No preset for this year."}</p>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((it) => (
                  <li key={it.key} className={cn("flex items-center gap-3 px-3 py-2 text-sm", it.alreadyAdded && "opacity-50")}>
                    <input type="checkbox" className="h-4 w-4 accent-primary" aria-label={`Include ${it.name}`}
                      checked={it.selected && !it.alreadyAdded} disabled={it.alreadyAdded}
                      onChange={(e) => toggle(it.key, { selected: e.target.checked })} />
                    <span className="w-32 shrink-0 tabular-nums text-muted-foreground">{fmt(it.date)}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {it.name}
                      {it.alreadyAdded && <span className="ml-2 text-xs">· already added</span>}
                      {!it.alreadyAdded && it.note && <span className="ml-2 text-xs text-muted-foreground">· {it.note}</span>}
                    </span>
                    {!it.alreadyAdded && (
                      <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                        <input type="checkbox" className="h-3.5 w-3.5 accent-primary" checked={it.isOptional}
                          onChange={(e) => toggle(it.key, { isOptional: e.target.checked })} />
                        Optional
                      </label>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {anyPast && (
            <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              Some dates have passed. Reports update now, late marks for this month re-count overnight, and locked payroll runs don&apos;t change.
            </p>
          )}
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">Holidays on the same date are combined into one.</p>
            <div className="flex gap-2">
              <Dialog.Close asChild><Button variant="outline">Cancel</Button></Dialog.Close>
              <Button onClick={submit} disabled={saving || chosen.length === 0 || (mode === "csv" && csvErrors.length > 0)}>
                {saving ? "Importing…" : `Import ${chosen.length}`}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
