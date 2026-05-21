"use client";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AssistantMessage } from "./assistant-message";
import { SuggestedPrompts } from "./suggested-prompts";
import { trackAssistant } from "@/lib/assistant/posthog-events";
import { Send } from "lucide-react";
import Image from "next/image";
import type { UserRole } from "@/types";

export function AssistantChat({
  conversationId,
  role,
}: {
  conversationId: string;
  role: UserRole;
}) {
  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/assistant/chat" }),
    []
  );
  const [chatError, setChatError] = useState<string | null>(null);
  const { messages, sendMessage, status } = useChat({
    id: conversationId,
    transport,
    onError: (err: Error) => {
      const msg = err?.message ?? "";
      if (msg.includes("402") || msg.toLowerCase().includes("budget")) {
        setChatError(
          "Your team's monthly AI assistant limit is reached. It resets next month — or ask your admin to raise the cap in Settings → AI Assistant."
        );
      } else {
        setChatError("Something went wrong, try again.");
      }
    },
  });

  const [input, setInput] = useState("");
  const isLoading = status === "submitted" || status === "streaming";

  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function sendText(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;
    setChatError(null);
    trackAssistant({
      name: "assistant_message_sent",
      props: { conversation_id: conversationId, char_count: trimmed.length },
    });
    sendMessage({ text: trimmed });
    setInput("");
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    sendText(input);
  }

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="flex-1 px-4 py-3">
        {messages.length === 0 ? (
          <EmptyState role={role} onPick={sendText} />
        ) : (
          <div className="flex flex-col gap-3">
            {(() => {
              let assistantCount = -1;
              return messages.map((m) => {
                const isAssistant = m.role !== "user";
                const assistantIndex = isAssistant ? ++assistantCount : undefined;
                return (
                  <AssistantMessage
                    key={m.id}
                    message={m}
                    conversationId={conversationId}
                    assistantIndex={assistantIndex}
                  />
                );
              });
            })()}
            <div ref={endRef} />
          </div>
        )}
      </ScrollArea>
      {chatError && (
        <div className="mx-3 mb-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {chatError}
        </div>
      )}
      <form
        onSubmit={onSubmit}
        className="flex items-end gap-2 border-t border-border px-3 py-3"
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={1}
          placeholder="Ask Jamba…"
          className="min-h-[40px] resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendText(input);
            }
          }}
        />
        <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
          <Send className="h-4 w-4" />
          <span className="sr-only">Send</span>
        </Button>
      </form>
    </div>
  );
}

function EmptyState({
  role,
  onPick,
}: {
  role: UserRole;
  onPick: (q: string) => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex flex-col items-center gap-2">
        <Image
          src="/Jamba.png"
          alt="Jamba"
          width={48}
          height={48}
          className="rounded-xl"
        />
        <div className="space-y-1">
          <p className="text-sm font-medium">Hi, I&apos;m Jamba.</p>
          <p className="text-xs text-muted-foreground">
            Ask me how to do anything in the app.
          </p>
        </div>
      </div>
      <SuggestedPrompts role={role} onPick={onPick} />
    </div>
  );
}
