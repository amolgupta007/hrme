import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { render } from "@react-email/render";
import { resend, FOUNDER_EMAIL_FROM } from "@/lib/resend";
import { OnboardingNudgeEmail } from "@/components/emails/onboarding-nudge";
import { UpgradePushEmail } from "@/components/emails/upgrade-push";

// Day-specific nudge content
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

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminSupabase();
  const now = new Date();
  const results = { day1: 0, day3: 0, day5: 0, day7: 0, errors: 0 };

  try {
    // Find orgs that are 1, 3, 5, or 7 days old (within a ±12hr window to avoid missing due to cron drift)
    const targetDays = [1, 3, 5, 7];

    for (const day of targetDays) {
      const windowStart = new Date(now.getTime() - (day * 24 + 12) * 60 * 60 * 1000);
      const windowEnd = new Date(now.getTime() - (day * 24 - 12) * 60 * 60 * 1000);

      const { data: orgs } = await supabase
        .from("organizations")
        .select("id, name, created_at")
        .gte("created_at", windowStart.toISOString())
        .lte("created_at", windowEnd.toISOString())
        .eq("plan", "starter"); // Only nudge starter orgs (paid orgs don't need nudging)

      if (!orgs || orgs.length === 0) continue;

      for (const org of orgs as any[]) {
        // Get org owner
        const { data: owner } = await supabase
          .from("employees")
          .select("email, first_name")
          .eq("org_id", org.id)
          .in("role", ["owner", "admin"])
          .order("created_at", { ascending: true })
          .limit(1)
          .single();

        if (!owner || !(owner as any).email) continue;

        const ownerEmail = (owner as any).email;
        const ownerFirstName = (owner as any).first_name ?? "there";

        try {
          if (day === 7) {
            // Upgrade push — get employee count for personalisation
            const { count } = await supabase
              .from("employees")
              .select("id", { count: "exact", head: true })
              .eq("org_id", org.id)
              .eq("status", "active");

            const html = await render(
              UpgradePushEmail({
                orgName: org.name,
                ownerFirstName,
                employeeCount: count ?? 0,
                upgradeUrl: "https://jambahr.com/dashboard/settings#billing",
              })
            );

            await resend.emails.send({
              from: FOUNDER_EMAIL_FROM,
              to: ownerEmail,
              subject: `${org.name} — week 1 on JambaHR. Here's what's next.`,
              html,
            });

            results.day7++;
          } else {
            const content = NUDGE_CONTENT[day as 1 | 3 | 5];
            const html = await render(
              OnboardingNudgeEmail({
                orgName: org.name,
                ownerFirstName,
                day: day as 1 | 3 | 5,
                subject: content.subject,
                heading: content.heading,
                body: content.body,
                ctaLabel: content.ctaLabel,
                ctaUrl: content.ctaUrl,
              })
            );

            await resend.emails.send({
              from: FOUNDER_EMAIL_FROM,
              to: ownerEmail,
              subject: content.subject,
              html,
            });

            (results as any)[`day${day}`]++;
          }
        } catch (err) {
          console.error(`Failed to send day ${day} nudge to ${ownerEmail}:`, err);
          results.errors++;
        }
      }
    }

    return NextResponse.json(results);
  } catch (err) {
    console.error("Onboarding nudges cron error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
