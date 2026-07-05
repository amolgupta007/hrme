"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trackAssistant } from "@/lib/assistant/posthog-events";

interface AssistantFeedbackButtonsProps {
  conversationId: string;
  assistantIndex: number;
}

export function AssistantFeedbackButtons({
  conversationId,
  assistantIndex,
}: AssistantFeedbackButtonsProps) {
  const [submitted, setSubmitted] = useState(false);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(rating: 1 | -1, commentText?: string) {
    setSending(true);
    try {
      await fetch("/api/assistant/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          assistantIndex,
          rating,
          comment: commentText || undefined,
        }),
      });
      trackAssistant({
        name: "assistant_feedback_given",
        props: { message_id: String(assistantIndex), rating },
      });
      setSubmitted(true);
      setShowComment(false);
    } catch {
      // best-effort: silently keep buttons enabled
    } finally {
      setSending(false);
    }
  }

  if (submitted) {
    return (
      <p className="mt-1 text-[11px] text-muted-foreground">Thanks!</p>
    );
  }

  return (
    <div className="mt-1">
      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          disabled={sending}
          onClick={() => submit(1)}
          aria-label="Helpful"
        >
          <ThumbsUp className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          disabled={sending}
          onClick={() => setShowComment((v) => !v)}
          aria-label="Not helpful"
        >
          <ThumbsDown className="h-3.5 w-3.5" />
        </Button>
      </div>
      {showComment && (
        <div className="mt-1.5 flex flex-col gap-1.5">
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What went wrong? (optional)"
            rows={2}
            className="min-h-[60px] resize-none text-xs"
            maxLength={2000}
          />
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs"
              disabled={sending}
              onClick={() => submit(-1, comment)}
            >
              Send
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs text-muted-foreground"
              disabled={sending}
              onClick={() => {
                setShowComment(false);
                setComment("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
