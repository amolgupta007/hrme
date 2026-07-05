import { NextResponse } from "next/server";
import { render } from "@react-email/render";
import { resend, FOUNDER_EMAIL_FROM } from "@/lib/resend";
import { runGeneration } from "@/actions/social";
import { SocialDraftReadyEmail } from "@/components/emails/social-draft-ready";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (process.env.SOCIAL_AGENT_ENABLED !== "true") {
    return NextResponse.json({ skipped: true, reason: "SOCIAL_AGENT_ENABLED is not 'true'" });
  }

  const result = await runGeneration({ triggeredBy: "cron" });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  const post = result.data;

  try {
    const html = await render(
      SocialDraftReadyEmail({
        captionPreview: post.caption.slice(0, 240),
        reviewUrl: `https://jambahr.com/superadmin/social/${post.id}`,
      }),
    );
    await resend.emails.send({
      from: FOUNDER_EMAIL_FROM,
      to: "amol@jambahr.com",
      subject: "🆕 New LinkedIn draft ready for review",
      html,
    });
  } catch (err) {
    return NextResponse.json({
      ok: true,
      postId: post.id,
      emailWarning: err instanceof Error ? err.message : "email failed",
    });
  }

  return NextResponse.json({ ok: true, postId: post.id });
}
