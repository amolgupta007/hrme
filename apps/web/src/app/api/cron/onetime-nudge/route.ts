import { NextResponse } from "next/server";
import { render } from "@react-email/render";
import { resend, FOUNDER_EMAIL_FROM, FROM_EMAIL } from "@/lib/resend";
import { OnboardingNudgeEmail } from "@/components/emails/onboarding-nudge";

const NUDGE_CONTENT = {
  1: {
    subject: "One quick thing before you forget…",
    heading: "add your first employee",
    body: "Your JambaHR workspace is set up, but it's empty. Adding employees takes 2 minutes — just their name, email, role, and department. Once they're in, you can manage leave, track performance, and keep everyone on the same page.",
    ctaLabel: "Add employees",
    ctaUrl: "https://jambahr.com/dashboard/employees",
  },
  3: {
    subject: "Your leave policy is set up — take a look",
    heading: "your leave policies are ready",
    body: "We've pre-filled standard Indian leave policies for you: 8 days Casual, 8 days Sick, 18 days Earned Leave, and Leave Without Pay. Review them and adjust the day counts to match what your company actually offers. It takes 2 minutes and saves confusion later.",
    ctaLabel: "Review leave policies",
    ctaUrl: "https://jambahr.com/dashboard/settings",
  },
  5: {
    subject: "Your team can't use JambaHR yet",
    heading: "invite your managers and team",
    body: "Right now only you can see your JambaHR dashboard. Invite your managers so they can approve leave requests, and invite employees so they can submit leave, view company announcements, and manage their own profile. Use the Invite button in the Employees section.",
    ctaLabel: "Invite your team",
    ctaUrl: "https://jambahr.com/dashboard/employees",
  },
} as const;

// Hard fire window: vercel.json crons use day-of-month/month, which would re-fire
// next year if left in place. Guard ensures this endpoint only sends during the
// intended 2026 window. After 2026-05-21 UTC it short-circuits to a no-op.
const FIRE_WINDOW_START = new Date("2026-05-17T00:00:00Z");
const FIRE_WINDOW_END = new Date("2026-05-21T23:59:59Z");

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  if (now < FIRE_WINDOW_START || now > FIRE_WINDOW_END) {
    return NextResponse.json({ skipped: true, reason: "outside one-shot fire window" });
  }

  const { searchParams } = new URL(req.url);
  const day = Number(searchParams.get("day")) as 1 | 3 | 5;
  const to = searchParams.get("to");
  const ownerFirstName = searchParams.get("name") ?? "there";
  const orgName = searchParams.get("org") ?? "your company";

  if (!to || !(day === 1 || day === 3 || day === 5)) {
    return NextResponse.json(
      { error: "Required query params: day {1|3|5} and to" },
      { status: 400 }
    );
  }

  const content = NUDGE_CONTENT[day];
  const html = await render(
    OnboardingNudgeEmail({
      orgName,
      ownerFirstName,
      day,
      subject: content.subject,
      heading: content.heading,
      body: content.body,
      ctaLabel: content.ctaLabel,
      ctaUrl: content.ctaUrl,
    })
  );

  const result = await resend.emails.send({
    from: FOUNDER_EMAIL_FROM,
    to,
    cc: [FROM_EMAIL], // support@ gets a copy so the team knows the nudge fired
    subject: content.subject,
    html,
  });

  if (result.error) {
    console.error("onetime-nudge send failed:", result.error);
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({ sent: { day, to, messageId: result.data?.id } });
}
