"use client";

import { useState } from "react";
import { Shield, X } from "lucide-react";

export function AssistantPrivacyInfo() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Privacy info"
      >
        <Shield className="h-3 w-3" />
        <span>Privacy</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-md rounded-2xl bg-background p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <p className="font-semibold">Your data with the assistant</p>
            </div>

            <div className="mt-3 space-y-3 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">Stored here, in your DB:</strong> your
                conversations live in your private JambaHR database. 90-day retention; PII
                redacted after 14 days.
              </p>
              <p>
                <strong className="text-foreground">Sent to AI providers:</strong> only the text
                you type. Goes to Anthropic Claude (via Vercel AI Gateway) for the reply, and
                Voyage AI for semantic search over JambaHR&apos;s help library. Both run with
                Zero Data Retention — no training, no logs.
              </p>
              <p>
                <strong className="text-foreground">Not sent anywhere today:</strong> your
                employee records, leave, payroll, attendance, or uploaded documents. The current
                assistant only knows how to use the app.
              </p>
              <p className="text-xs">
                Admins control everything from{" "}
                <a href="/dashboard/settings" className="text-primary underline">
                  Settings → AI Assistant
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
