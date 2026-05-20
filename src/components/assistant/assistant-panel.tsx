"use client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AssistantChat } from "./assistant-chat";
import { AssistantPrivacyInfo } from "./assistant-privacy-info";
import { useMemo } from "react";
import type { UserRole } from "@/types";

export function AssistantPanel({
  open,
  onOpenChange,
  role,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  role: UserRole;
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
        {/* pr-12 reserves room for the Sheet's built-in close (X) button at absolute right-4. */}
        <SheetHeader className="border-b border-border py-3 pl-4 pr-12">
          <div className="flex items-center gap-2">
            <SheetTitle className="text-base">Ask JambaHR</SheetTitle>
            <AssistantPrivacyInfo />
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-hidden">
          <AssistantChat conversationId={conversationId} role={role} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
