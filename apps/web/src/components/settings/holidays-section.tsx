"use client";

import * as React from "react";
import { Plus, Pencil, Trash2, Download, PartyPopper } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DestructiveDialog } from "@/components/ui/destructive-dialog";
import { HolidayDialog } from "@/components/settings/holiday-dialog";
import { HolidayImportDialog } from "@/components/settings/holiday-import-dialog";
import { deleteHoliday, listHolidays, type HolidayRow } from "@/actions/holidays";
import { isWeekOff, type WeekOffPolicy } from "@jambahr/shared/attendance/week-off";

type Props = { initialYear: number; initialHolidays: HolidayRow[]; weekOffPolicy: WeekOffPolicy | null };

const fmt = (iso: string) =>
  new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const weekday = (iso: string) =>
  new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });

export function HolidaysSection({ initialYear, initialHolidays, weekOffPolicy }: Props) {
  const years = [initialYear - 1, initialYear, initialYear + 1];
  const [year, setYear] = React.useState(initialYear);
  const [rows, setRows] = React.useState<HolidayRow[]>(initialHolidays);
  const [loading, setLoading] = React.useState(false);
  const [editing, setEditing] = React.useState<HolidayRow | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<HolidayRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const load = React.useCallback(async (y: number) => {
    setLoading(true);
    const res = await listHolidays(y);
    setLoading(false);
    if (res.success) setRows(res.data);
    else toast.error(res.error);
  }, []);

  React.useEffect(() => {
    if (year !== initialYear) load(year);
    else setRows(initialHolidays);
  }, [year, initialYear, initialHolidays, load]);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    const res = await deleteHoliday(pendingDelete.id);
    setDeleting(false);
    setPendingDelete(null);
    if (!res.success) return void toast.error(res.error);
    toast.success("Holiday deleted");
    load(year);
  }

  const mandatory = rows.filter((r) => !r.is_optional).length;

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Holidays</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Mandatory holidays are days off for everyone. Optional ones show on the calendar but are normal working days.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <Download className="mr-1.5 h-4 w-4" /> Import
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="mr-1.5 h-4 w-4" /> Add holiday
          </Button>
        </div>
      </div>

      <div className="mb-3 flex gap-1" role="tablist" aria-label="Year">
        {years.map((y) => (
          <Button key={y} role="tab" aria-selected={y === year} size="sm" variant={y === year ? "secondary" : "ghost"} onClick={() => setYear(y)}>
            {y}
          </Button>
        ))}
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-8 text-center">
          <PartyPopper className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No holidays for {year} yet.</p>
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>Import from a list</Button>
        </div>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            {mandatory} mandatory · {rows.length - mandatory} optional
          </p>
          <ul className="divide-y divide-border">
            {rows.map((h) => {
              const onWeekOff = weekOffPolicy ? isWeekOff(h.date, weekOffPolicy) : false;
              return (
                <li key={h.id} className="flex items-center gap-4 py-3">
                  <div className="w-16 shrink-0 text-sm font-medium tabular-nums">{fmt(h.date)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium">{h.name}</p>
                      <span className={h.is_optional
                        ? "rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                        : "rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"}>
                        {h.is_optional ? "Optional" : "Mandatory"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {weekday(h.date)}{onWeekOff ? " · already a week-off" : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit ${h.name}`}
                      onClick={() => { setEditing(h); setFormOpen(true); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                      aria-label={`Delete ${h.name}`} onClick={() => setPendingDelete(h)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <HolidayDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} defaultYear={year} onSaved={() => load(year)} />
      <HolidayImportDialog open={importOpen} onOpenChange={setImportOpen} year={year} onImported={() => load(year)} />
      <DestructiveDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => { if (!o) setPendingDelete(null); }}
        title={pendingDelete ? `Delete "${pendingDelete.name}"?` : ""}
        description="It stops being a holiday from today in reports and lateness. Locked payroll runs don't change."
        confirmLabel="Delete holiday"
        loading={deleting}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
