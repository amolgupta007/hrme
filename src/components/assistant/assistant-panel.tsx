"use client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AssistantChat } from "./assistant-chat";
import { useMemo } from "react";

export function AssistantPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const conversationId = useMemo(
    () =>
      typeof crypto !== "undefined"
        ? crypto.randomUUID()
        : String(Date.now()),
    []
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border px-4 py-3">
          <SheetTitle className="text-base">Ask JambaHR</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-hidden">
          <AssistantChat conversationId={conversationId} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
