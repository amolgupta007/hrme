import { NextResponse } from "next/server";
import { render } from "@react-email/render";
import { resend, FOUNDER_EMAIL_FROM } from "@/lib/resend";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getPostStatus } from "@/lib/social/buffer";
import { SocialPublishFailedEmail } from "@/components/emails/social-publish-failed";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminSupabase();

  const { data: posts, error } = await supabase
    .from("social_posts")
    .select("id, buffer_post_id, caption")
    .in("status", ["scheduled", "publishing"])
    .not("buffer_post_id", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const summary = { checked: 0, published: 0, failed: 0, errors: 0 };

  for (const post of posts ?? []) {
    summary.checked++;
    const bufferPostId = post.buffer_post_id as string;
    const status = await getPostStatus(bufferPostId);

    if (!status.success) {
      summary.errors++;
      continue;
    }

    if (status.data.status === "sent") {
      await supabase
        .from("social_posts")
        .update({
          status: "published",
          published_at: status.data.sentAt ?? new Date().toISOString(),
        })
        .eq("id", post.id);
      summary.published++;
    } else if (status.data.status === "error") {
      await supabase
        .from("social_posts")
        .update({
          status: "failed",
          error_message: status.data.errorMessage ?? "Buffer reported error",
        })
        .eq("id", post.id);
      summary.failed++;

      try {
        const html = await render(
          SocialPublishFailedEmail({
            postId: post.id as string,
            captionPreview: (post.caption as string).slice(0, 240),
            errorMessage: status.data.errorMessage ?? "Buffer reported error",
            reviewUrl: `https://jambahr.com/superadmin/social/${post.id}`,
          }),
        );
        await resend.emails.send({
          from: FOUNDER_EMAIL_FROM,
          to: "amol@jambahr.com",
          subject: "❌ LinkedIn post failed to publish",
          html,
        });
      } catch {
        // email failure is non-fatal — DB state is the source of truth
      }
    }
  }

  return NextResponse.json({ ok: true, ...summary });
}
