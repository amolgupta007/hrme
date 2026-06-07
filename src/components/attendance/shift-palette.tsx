"use client";
import { useDraggable } from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import type { Shift } from "@/actions/shifts";

function DraggableShift({ shift }: { shift: Shift }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `shift-${shift.id}`,
    data: { shift },
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-xs cursor-grab active:cursor-grabbing hover:border-primary/50"
    >
      <GripVertical className="h-3 w-3 text-muted-foreground" />
      <span className="font-medium">{shift.name}</span>
      <span className="text-muted-foreground">{shift.start_time}–{shift.end_time}</span>
    </div>
  );
}

export function ShiftPalette({ shifts }: { shifts: Shift[] }) {
  return (
    <div className="space-y-2 p-3 rounded-xl border border-border bg-card">
      <p className="text-xs font-semibold text-muted-foreground">Drag a shift onto a cell</p>
      {shifts.map((s) => <DraggableShift key={s.id} shift={s} />)}
      {shifts.length === 0 && <p className="text-xs text-muted-foreground">No active shifts. Configure them in Settings → Attendance.</p>}
    </div>
  );
}
