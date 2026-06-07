"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Star, MoonStar, Pencil, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setDefaultShift, deactivateShift } from "@/actions/shifts";
import type { Shift } from "@/actions/shifts";
import { ShiftFormDialog } from "./shift-form-dialog";

export function ShiftMasterCard({ shifts }: { shifts: Shift[] }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Shift | null>(null);

  async function handleSetDefault(id: string) {
    const r = await setDefaultShift(id);
    if (r.success) toast.success("Default shift updated");
    else toast.error(r.error);
  }
  async function handleDeactivate(id: string) {
    const r = await deactivateShift(id);
    if (r.success) toast.success("Shift deactivated");
    else toast.error(r.error);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold">Shift Master</p>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add shift
        </Button>
      </div>
      {shifts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No shifts yet. Add your first shift to get started.</p>
      ) : (
        <ul className="divide-y divide-border">
          {shifts.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{s.name}</span>
                  {s.is_default && <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary"><Star className="h-3 w-3" />Default</span>}
                  {s.is_overnight && <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700"><MoonStar className="h-3 w-3" />Overnight</span>}
                  {!s.active && <span className="text-[10px] text-muted-foreground">Inactive</span>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {s.start_time}–{s.end_time} · {s.total_hours}h
                  {s.break_minutes > 0 ? ` · ${s.break_minutes}m break` : ""}
                  {s.grace_minutes > 0 ? ` · ${s.grace_minutes}m grace` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {!s.is_default && s.active && (
                  <Button variant="ghost" size="sm" onClick={() => handleSetDefault(s.id)}><Star className="h-3.5 w-3.5" /></Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => { setEditing(s); setOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                {s.active && (
                  <Button variant="ghost" size="sm" onClick={() => handleDeactivate(s.id)}><Power className="h-3.5 w-3.5" /></Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <ShiftFormDialog initial={editing ?? undefined} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}
