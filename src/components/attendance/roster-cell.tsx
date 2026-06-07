"use client";
import { useDroppable } from "@dnd-kit/core";
import type { RosterCell as Cell } from "@/actions/shifts";

interface Props {
  cell: Cell;
  employeeId: string;
  onClickAssignment?: (assignmentId: string) => void;
}

export function RosterCell({ cell, employeeId, onClickAssignment }: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: `cell-${employeeId}-${cell.date}`,
    data: { employee_id: employeeId, date: cell.date },
  });

  const tentative = cell.type === "rotational";
  return (
    <td
      ref={setNodeRef}
      className={`h-12 align-middle text-center text-xs border border-border ${isOver ? "bg-primary/20" : "bg-card"}`}
    >
      {cell.shift_name ? (
        <button
          type="button"
          onClick={() => cell.assignment_id && onClickAssignment?.(cell.assignment_id)}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tentative ? "bg-primary/10 text-primary/70 border border-dashed border-primary/40" : "bg-primary/15 text-primary"}`}
        >
          {cell.shift_name}{tentative && "?"}
        </button>
      ) : (
        <span className="text-muted-foreground/40">—</span>
      )}
    </td>
  );
}
