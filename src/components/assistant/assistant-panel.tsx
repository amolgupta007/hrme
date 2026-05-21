"use client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AssistantChat } from "./assistant-chat";
import { AssistantPrivacyInfo } from "./assistant-privacy-info";
import { AssistantHistory } from "./assistant-history";
import Image from "next/image";
import { useState } from "react";
import type { UserRole } from "@/types";
import type { HistoryMessage } from "@/lib/assistant/conversations";

export function AssistantPanel({
  open,
  onOpenChange,
  role,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  role: UserRole;
}) {
  const [conversationId, setConversationId] = useState(() =>
    typeof crypto !== "undefined" ? crypto.randomUUID() : String(Date.now())
  );
  const [initialMessages, setInitialMessages] = useState<
    HistoryMessage[] | undefined
  >(undefined);

  function handleSelectConversation(id: string, msgs: HistoryMessage[]) {
    setConversationId(id);
    setInitialMessages(msgs);
  }

  function handleNewChat() {
    setConversationId(
      typeof crypto !== "undefined" ? crypto.randomUUID() : String(Date.now())
    );
    setInitialMessages(undefined);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col p-0 sm:max-w-md"
      >
        {/* pr-12 reserves room for the Sheet's built-in close (X) button at absolute right-4. */}
        <SheetHeader className="border-b border-border py-3 pl-4 pr-12">
          <div className="flex items-center gap-2">
            <Image
              src="/Jamba.png"
              alt="Jamba"
              width={24}
              height={24}
              className="rounded-md"
            />
            <SheetTitle className="text-base">Ask Jamba</SheetTitle>
            <AssistantHistory
              currentId={conversationId}
              onSelect={handleSelectConversation}
              onNew={handleNewChat}
            />
            <AssistantPrivacyInfo />
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-hidden">
          <AssistantChat
            key={conversationId}
            conversationId={conversationId}
            role={role}
            initialMessages={initialMessages}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
