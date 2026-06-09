"use client";

import { useState, useTransition } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { LeadCard, type LeadCardData } from "./lead-card";
import { LEAD_STAGES, stageLabel, type LeadStage } from "@/lib/geo/stages";
import { updateLeadStage } from "@/actions/geo-leads";

interface KanbanProps {
  leads: LeadCardData[];
  canDrag: boolean;
}

export function LeadsKanban({ leads, canDrag }: KanbanProps) {
  const [items, setItems] = useState<LeadCardData[]>(leads);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
    useSensor(KeyboardSensor),
  );

  function onDragEnd(e: DragEndEvent) {
    if (!e.over) return;
    const newStage = e.over.id as LeadStage;
    const draggedId = e.active.id as string;
    const dragged = items.find((l) => l.id === draggedId);
    if (!dragged || dragged.stage === newStage) return;

    const prev = items;
    setItems(items.map((l) => (l.id === draggedId ? { ...l, stage: newStage } : l)));

    startTransition(async () => {
      const res = await updateLeadStage(draggedId, { stage: newStage });
      if (!res.success) {
        setItems(prev); // rollback
        toast.error(res.error ?? "Failed to update stage");
      }
    });
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {LEAD_STAGES.map((stage) => (
          <KanbanColumn
            key={stage}
            stage={stage}
            leads={items.filter((l) => l.stage === stage)}
            canDrag={canDrag}
          />
        ))}
      </div>
    </DndContext>
  );
}

function KanbanColumn({
  stage,
  leads,
  canDrag,
}: {
  stage: LeadStage;
  leads: LeadCardData[];
  canDrag: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div
      ref={setNodeRef}
      className={
        "rounded-md bg-muted/30 p-2 min-h-[200px] " +
        (isOver ? "ring-2 ring-primary" : "")
      }
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1 mb-2 flex justify-between">
        <span>{stageLabel(stage)}</span>
        <span>{leads.length}</span>
      </div>
      <div className="space-y-2">
        {leads.map((lead) =>
          canDrag ? (
            <DraggableCard key={lead.id} lead={lead} />
          ) : (
            <LeadCard key={lead.id} lead={lead} />
          ),
        )}
      </div>
    </div>
  );
}

function DraggableCard({ lead }: { lead: LeadCardData }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: lead.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      <LeadCard lead={lead} draggable />
    </div>
  );
}
