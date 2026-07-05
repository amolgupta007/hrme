"use client";

import { useEffect } from "react";
import { FeedbackProvider, useFeedback } from "./feedback-context";
import { FeedbackDialog } from "./feedback-dialog";

export const OPEN_FEEDBACK_EVENT = "open-feedback";

function ShortcutAndEventListener() {
  const { openDialog } = useFeedback();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        // Inside text inputs, only fire on Shift+Cmd/Ctrl+/ to avoid hijacking
        if (tag === "INPUT" || tag === "TEXTAREA") {
          if (!e.shiftKey) return;
        }
        e.preventDefault();
        openDialog();
      }
    }
    function onOpen() {
      openDialog();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_FEEDBACK_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_FEEDBACK_EVENT, onOpen);
    };
  }, [openDialog]);
  return null;
}

export function ReportFeedbackTriggerRoot({ children }: { children: React.ReactNode }) {
  return (
    <FeedbackProvider>
      {children}
      <ShortcutAndEventListener />
      <FeedbackDialog />
    </FeedbackProvider>
  );
}
