"use client";
import { useState } from "react";
import Image from "next/image";
import { AssistantPanel } from "./assistant-panel";
import { trackAssistant } from "@/lib/assistant/posthog-events";
import type { UserRole } from "@/types";

export function AssistantLauncher({
  enabled,
  role,
}: {
  enabled: boolean;
  role: UserRole;
}) {
  const [open, setOpen] = useState(false);

  if (!enabled) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          trackAssistant({
            name: "assistant_panel_opened",
            props: { source: "launcher" },
          });
        }}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full border border-border bg-background shadow-lg transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        aria-label="Ask Jamba"
      >
        <Image
          src="/Jamba.png"
          alt="Ask Jamba"
          width={36}
          height={36}
          className="rounded-md"
        />
      </button>
      <AssistantPanel open={open} onOpenChange={setOpen} role={role} />
    </>
  );
}
