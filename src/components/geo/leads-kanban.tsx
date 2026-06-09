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

    const prevStage = dragged.stage;
    const prev = items;
    setItems(items.map((l) => (l.id === draggedId ? { ...l, stage: newStage } : l)));

    startTransition(async () => {
      const res = await updateLeadStage(draggedId, { stage: newStage });
      if (!res.success) {
        setItems(prev); // rollback
        // Server error wins when present (e.g. "Out of scope"). Fallback
        // names what just happened: the card snapped back to its prior
        // column, so the operator knows the move didn't take and where to
        // try again.
        toast.error(
          res.error ??
            `Move failed — “${dragged.name}” returned to ${stageLabel(
              prevStage,
            )}. Check your connection and try again.`,
        );
      }
    });
  }

  // Horizontal-scroll layout. Six stages × ~280px each = ~1700px — wider
  // than every common laptop viewport, so we accept the scroll. Each column
  // is snap-aligned so swipes/scrolls land cleanly on a column edge. The
  // negative margin pulls the scroll container out to the page edge so
  // scrollbars don't visually crop the gutter.
  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="-mx-6 overflow-x-auto px-6 pb-2 [scroll-snap-type:x_proximity]">
        <div className="flex min-w-max gap-3">
          {LEAD_STAGES.map((stage) => (
            <KanbanColumn
              key={stage}
              stage={stage}
              leads={items.filter((l) => l.stage === stage)}
              canDrag={canDrag}
            />
          ))}
        </div>
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
      aria-label={`${stageLabel(stage)} column — ${leads.length} lead${leads.length === 1 ? "" : "s"}`}
      className={
        "w-[280px] shrink-0 rounded-md bg-muted/30 p-2 min-h-[200px] [scroll-snap-align:start] " +
        (isOver ? "ring-2 ring-primary" : "")
      }
    >
      <div className="mb-2 flex items-center justify-between px-1 text-sm">
        <span className="font-semibold text-foreground">{stageLabel(stage)}</span>
        <span className="tabular-nums text-xs text-muted-foreground">
          {leads.length}
        </span>
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
