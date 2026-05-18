"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MessageSquareText } from "lucide-react";
import { AssistantPanel } from "./assistant-panel";
import { trackAssistant } from "@/lib/assistant/posthog-events";

export function AssistantLauncher({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);

  if (!enabled) return null;

  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
          trackAssistant({
            name: "assistant_panel_opened",
            props: { source: "launcher" },
          });
        }}
        className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full shadow-lg"
        aria-label="Open JambaHR assistant"
      >
        <MessageSquareText className="h-6 w-6" />
      </Button>
      <AssistantPanel open={open} onOpenChange={setOpen} />
    </>
  );
}
