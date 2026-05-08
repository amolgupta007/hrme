"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/types";
import { createAdminSupabase } from "@/lib/supabase/server";
import { isSuperadminAuthenticated } from "@/lib/superadmin-auth";
import { generateDraft } from "@/lib/social/anthropic";
import { renderAndUpload } from "@/lib/social/image-gen";
import {
  pickNextTheme,
  getRecentCaptionsForTheme,
  markThemeUsed,
} from "@/lib/social/themes";
import {
  createLinkedInPost,
  deleteBufferPost,
  getQueuedPostsCount,
} from "@/lib/social/buffer";
import type { SocialPost, SocialPostStatus } from "@/lib/social/types";

const QUEUE_HARD_CAP = 10; // Buffer free tier
const QUEUE_SOFT_GUARD = 9; // leave one slot to avoid race-induced reject

type AuthFailure = { success: false; error: string };

function requireAuth(): AuthFailure | null {
  if (!isSuperadminAuthenticated()) return { success: false, error: "Unauthorized" };
  return null;
}

type Filter = "pending" | "scheduled" | "published" | "rejected" | "all";

const STATUS_BY_FILTER: Record<Filter, SocialPostStatus[] | null> = {
  pending: ["pending_approval"],
  scheduled: ["approved", "scheduled", "publishing"],
  published: ["published"],
  rejected: ["rejected", "failed"],
  all: null,
};

export async function listPosts(
  filter: Filter = "pending",
): Promise<ActionResult<SocialPost[]>> {
  const auth = requireAuth();
  if (auth) return auth;

  const supabase = createAdminSupabase();
  let query = supabase.from("social_posts").select("*").order("created_at", { ascending: false });

  const statuses = STATUS_BY_FILTER[filter];
  if (statuses) query = query.in("status", statuses);

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []) as SocialPost[] };
}

export async function getPost(id: string): Promise<ActionResult<SocialPost | null>> {
  const auth = requireAuth();
  if (auth) return auth;

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("social_posts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? null) as SocialPost | null };
}

const UpdateDraftSchema = z.object({
  caption: z.string().min(1).max(2800).optional(),
  hashtags: z.array(z.string().min(1).max(40)).max(10).optional(),
  imageAlt: z.string().max(140).optional(),
});

export async function updateDraft(
  id: string,
  patch: z.infer<typeof UpdateDraftSchema>,
): Promise<ActionResult<SocialPost>> {
  const auth = requireAuth();
  if (auth) return auth;

  const parsed = UpdateDraftSchema.safeParse(patch);
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message };

  const updates: Record<string, unknown> = {};
  if (parsed.data.caption !== undefined) updates.caption = parsed.data.caption;
  if (parsed.data.hashtags !== undefined) updates.hashtags = parsed.data.hashtags;
  if (parsed.data.imageAlt !== undefined) updates.image_alt_text = parsed.data.imageAlt;

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("social_posts")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath("/superadmin/social");
  revalidatePath(`/superadmin/social/${id}`);
  return { success: true, data: data as SocialPost };
}

export async function regenerateCaption(
  id: string,
  instruction?: string,
): Promise<ActionResult<SocialPost>> {
  const auth = requireAuth();
  if (auth) return auth;

  const supabase = createAdminSupabase();
  const post = await getPost(id);
  if (!post.success) return post;
  if (!post.data) return { success: false, error: "Post not found" };
  if (!post.data.theme_id) return { success: false, error: "Post has no theme" };

  const themeRes = await supabase
    .from("social_themes")
    .select("*")
    .eq("id", post.data.theme_id)
    .single();
  if (themeRes.error || !themeRes.data) {
    return { success: false, error: themeRes.error?.message ?? "Theme not found" };
  }

  const recent = await getRecentCaptionsForTheme(post.data.theme_id);
  const recentCaptions = recent.success ? recent.data : [];

  const draft = await generateDraft({
    theme: themeRes.data as never,
    recentCaptions,
    instruction,
  });
  if (!draft.success) return draft;

  const { data, error } = await supabase
    .from("social_posts")
    .update({
      caption: draft.data.caption,
      hashtags: draft.data.hashtags,
      image_prompt: draft.data.imagePrompt,
      image_alt_text: draft.data.imageAltText,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath("/superadmin/social");
  revalidatePath(`/superadmin/social/${id}`);
  return { success: true, data: data as SocialPost };
}

export async function regenerateImage(
  id: string,
  instruction?: string,
): Promise<ActionResult<SocialPost>> {
  const auth = requireAuth();
  if (auth) return auth;

  const supabase = createAdminSupabase();
  const post = await getPost(id);
  if (!post.success) return post;
  if (!post.data) return { success: false, error: "Post not found" };

  const promptToUse = instruction
    ? `${post.data.image_prompt ?? ""}\n\nAdjustment: ${instruction}`.trim()
    : post.data.image_prompt;

  if (!promptToUse) return { success: false, error: "No image prompt on post" };

  const render = await renderAndUpload({ postId: id, prompt: promptToUse });
  if (!render.success) return render;

  const { data, error } = await supabase
    .from("social_posts")
    .update({
      image_url: render.data.publicUrl,
      image_prompt: promptToUse,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath("/superadmin/social");
  revalidatePath(`/superadmin/social/${id}`);
  return { success: true, data: data as SocialPost };
}

const ApproveSchema = z.object({
  mode: z.enum(["queue", "customScheduled"]),
  dueAt: z.string().datetime().optional(),
});

export async function approveAndSchedule(
  id: string,
  args: z.infer<typeof ApproveSchema>,
): Promise<ActionResult<SocialPost>> {
  const auth = requireAuth();
  if (auth) return auth;

  const parsed = ApproveSchema.safeParse(args);
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message };
  if (parsed.data.mode === "customScheduled" && !parsed.data.dueAt) {
    return { success: false, error: "dueAt required when mode=customScheduled" };
  }

  const channelId = process.env.BUFFER_LINKEDIN_CHANNEL_ID;
  const orgId = process.env.BUFFER_ORG_ID;
  if (!channelId || !orgId) {
    return { success: false, error: "BUFFER_LINKEDIN_CHANNEL_ID or BUFFER_ORG_ID not set" };
  }

  const post = await getPost(id);
  if (!post.success) return post;
  if (!post.data) return { success: false, error: "Post not found" };
  if (post.data.status !== "pending_approval") {
    return { success: false, error: `Cannot approve from status '${post.data.status}'` };
  }
  if (!post.data.image_url) {
    return { success: false, error: "Post has no image — regenerate before approving" };
  }

  const queueCount = await getQueuedPostsCount(orgId, channelId);
  if (!queueCount.success) return queueCount;
  if (queueCount.data >= QUEUE_SOFT_GUARD) {
    return {
      success: false,
      error: `Buffer queue near cap (${queueCount.data}/${QUEUE_HARD_CAP}). Wait for posts to publish.`,
    };
  }

  const fullText = composeFinalText(post.data.caption, post.data.hashtags);

  const buffer = await createLinkedInPost({
    channelId,
    text: fullText,
    imageUrl: post.data.image_url,
    imageAltText: post.data.image_alt_text ?? "JambaHR LinkedIn post",
    mode: parsed.data.mode === "queue" ? "addToQueue" : "customScheduled",
    dueAt: parsed.data.dueAt,
  });
  if (!buffer.success) return buffer;

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("social_posts")
    .update({
      status: "scheduled",
      buffer_post_id: buffer.data.postId,
      buffer_channel_id: channelId,
      scheduled_for: buffer.data.dueAt ?? parsed.data.dueAt ?? null,
      approved_at: new Date().toISOString(),
      approved_by: "superadmin",
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath("/superadmin/social");
  revalidatePath(`/superadmin/social/${id}`);
  return { success: true, data: data as SocialPost };
}

export async function rejectPost(
  id: string,
  reason: string,
): Promise<ActionResult<SocialPost>> {
  const auth = requireAuth();
  if (auth) return auth;

  if (!reason || reason.trim().length < 3) {
    return { success: false, error: "Rejection reason required (min 3 chars)" };
  }

  const supabase = createAdminSupabase();
  const post = await getPost(id);
  if (!post.success) return post;
  if (!post.data) return { success: false, error: "Post not found" };

  // If already scheduled to Buffer, try to delete from Buffer too
  if (post.data.buffer_post_id && (post.data.status === "scheduled" || post.data.status === "approved")) {
    const del = await deleteBufferPost(post.data.buffer_post_id);
    if (!del.success) {
      return { success: false, error: `Buffer delete failed: ${del.error}` };
    }
  }

  const { data, error } = await supabase
    .from("social_posts")
    .update({
      status: "rejected",
      rejected_at: new Date().toISOString(),
      rejection_reason: reason,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath("/superadmin/social");
  revalidatePath(`/superadmin/social/${id}`);
  return { success: true, data: data as SocialPost };
}

export async function manualGenerate(
  themeId?: string,
): Promise<ActionResult<SocialPost>> {
  const auth = requireAuth();
  if (auth) return auth;

  const result = await runGeneration({ themeId, triggeredBy: "manual" });
  if (!result.success) return result;

  revalidatePath("/superadmin/social");
  return result;
}

interface RunGenerationInput {
  themeId?: string;
  triggeredBy: "cron" | "manual";
}

/**
 * Shared orchestration used by both manualGenerate (action) and the
 * social-agent-generate cron route. Authentication is the caller's
 * responsibility.
 */
export async function runGeneration(
  input: RunGenerationInput,
): Promise<ActionResult<SocialPost>> {
  const supabase = createAdminSupabase();
  const startedAt = new Date();

  const runInsert = await supabase
    .from("social_agent_runs")
    .insert({ triggered_by: input.triggeredBy })
    .select("id")
    .single();
  if (runInsert.error) {
    return { success: false, error: `Run insert failed: ${runInsert.error.message}` };
  }
  const runId = runInsert.data.id as string;

  const errors: Array<{ step: string; message: string }> = [];

  const recordError = (step: string, message: string) => {
    errors.push({ step, message });
  };

  const finalize = async (
    finalResult: ActionResult<SocialPost>,
    draftsGenerated: number,
  ) => {
    await supabase
      .from("social_agent_runs")
      .update({
        drafts_generated: draftsGenerated,
        errors: errors.length > 0 ? errors : null,
        duration_ms: Date.now() - startedAt.getTime(),
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);
    return finalResult;
  };

  let theme;
  if (input.themeId) {
    const fetched = await supabase
      .from("social_themes")
      .select("*")
      .eq("id", input.themeId)
      .single();
    if (fetched.error || !fetched.data) {
      recordError("pickTheme", fetched.error?.message ?? "Theme not found");
      return finalize({ success: false, error: "Theme not found" }, 0);
    }
    theme = fetched.data;
  } else {
    const next = await pickNextTheme();
    if (!next.success) {
      recordError("pickTheme", next.error);
      return finalize({ success: false, error: next.error }, 0);
    }
    theme = next.data;
  }

  const recent = await getRecentCaptionsForTheme(theme.id);
  const recentCaptions = recent.success ? recent.data : [];

  const draft = await generateDraft({
    theme: theme as never,
    recentCaptions,
  });
  if (!draft.success) {
    recordError("generateDraft", draft.error);
    return finalize({ success: false, error: draft.error }, 0);
  }

  const insert = await supabase
    .from("social_posts")
    .insert({
      status: "pending_approval",
      platform: "linkedin",
      theme_id: theme.id,
      caption: draft.data.caption,
      hashtags: draft.data.hashtags,
      image_prompt: draft.data.imagePrompt,
      image_alt_text: draft.data.imageAltText,
      generated_by_run_id: runId,
    })
    .select("*")
    .single();

  if (insert.error || !insert.data) {
    recordError("insertPost", insert.error?.message ?? "insert failed");
    return finalize(
      { success: false, error: insert.error?.message ?? "insert failed" },
      0,
    );
  }
  const postId = insert.data.id as string;

  const render = await renderAndUpload({ postId, prompt: draft.data.imagePrompt });
  if (!render.success) {
    recordError("renderImage", render.error);
    // Keep the post so the founder can manually regenerate the image
    await supabase
      .from("social_posts")
      .update({ error_message: `Image render failed: ${render.error}` })
      .eq("id", postId);
    return finalize({ success: true, data: insert.data as SocialPost }, 1);
  }

  const finalPost = await supabase
    .from("social_posts")
    .update({ image_url: render.data.publicUrl })
    .eq("id", postId)
    .select("*")
    .single();

  if (finalPost.error || !finalPost.data) {
    recordError("updateImageUrl", finalPost.error?.message ?? "update failed");
    return finalize({ success: true, data: insert.data as SocialPost }, 1);
  }

  await markThemeUsed(theme.id);

  return finalize({ success: true, data: finalPost.data as SocialPost }, 1);
}

function composeFinalText(caption: string, hashtags: string[]): string {
  if (hashtags.length === 0) return caption;
  return `${caption}\n\n${hashtags.map(formatHashtag).join(" ")}`;
}

function formatHashtag(tag: string): string {
  const cleaned = tag.replace(/^#+/, "").trim();
  return `#${cleaned}`;
}
