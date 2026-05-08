import type { ActionResult } from "@/types";

export type SocialPostStatus =
  | "pending_approval"
  | "approved"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed"
  | "rejected";

export type SocialPlatform = "linkedin";

export type AgentRunTrigger = "cron" | "manual";

export interface SocialTheme {
  id: string;
  slug: string;
  title: string;
  description: string;
  audience: string;
  example_hooks: unknown[];
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
}

export interface SocialPost {
  id: string;
  status: SocialPostStatus;
  platform: SocialPlatform;
  theme_id: string | null;
  caption: string;
  hashtags: string[];
  image_prompt: string | null;
  image_url: string | null;
  image_alt_text: string | null;
  buffer_post_id: string | null;
  buffer_channel_id: string | null;
  scheduled_for: string | null;
  error_message: string | null;
  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  published_at: string | null;
  generated_by_run_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SocialAgentRun {
  id: string;
  triggered_by: AgentRunTrigger;
  drafts_generated: number;
  errors: Array<{ step: string; message: string }> | null;
  duration_ms: number | null;
  started_at: string;
  finished_at: string | null;
}

export interface GeneratedDraft {
  caption: string;
  hashtags: string[];
  imagePrompt: string;
  imageAltText: string;
}

export type BufferScheduleMode =
  | "addToQueue"
  | "shareNow"
  | "shareNext"
  | "customScheduled"
  | "recommendedTime";

export interface BufferCreatePostArgs {
  channelId: string;
  text: string;
  imageUrl: string;
  imageAltText: string;
  mode?: BufferScheduleMode;
  dueAt?: string;
}

export interface BufferCreatePostResult {
  postId: string;
  status: string;
  dueAt: string | null;
}

export interface BufferPostStatusResult {
  postId: string;
  status: "draft" | "needs_approval" | "scheduled" | "sending" | "sent" | "error";
  errorMessage: string | null;
  sentAt: string | null;
}

export type SocialActionResult<T> = ActionResult<T>;
