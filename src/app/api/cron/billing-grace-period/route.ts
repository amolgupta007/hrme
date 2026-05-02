import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { render } from "@react-email/render";
import { resend, FROM_EMAIL } from "@/lib/resend";
import { SubscriptionGracePeriodEndingEmail } from "@/components/emails/subscription-grace-period-ending";

const GRACE_DAYS = 7;
const WARNING_BEFORE_END_DAYS = 3;

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminSupabase();
  const now = new Date();
  const downgradeCutoff = new Date(now.getTime() - GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const warningStart = new Date(
    now.getTime() - (GRACE_DAYS - WARNING_BEFORE_END_DAYS) * 24 * 60 * 60 * 1000
  ).toISOString();
  const warningEnd = new Date(
    now.getTime() - (GRACE_DAYS - WARNING_BEFORE_END_DAYS - 1) * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: dueOrgs, error: downgradeFetchError } = await supabase
    .from("organizations")
    .select("id, name")
    .in("subscription_status", ["paused", "halted"])
    .lt("subscription_paused_at", downgradeCutoff);

  if (downgradeFetchError) {
    console.error("billing-grace-period: fetch error", downgradeFetchError);
    return NextResponse.json({ error: downgradeFetchError.message }, { status: 500 });
  }

  let downgraded = 0;
  for (const org of (dueOrgs ?? []) as { id: string; name: string }[]) {
    const { error: updateError } = await supabase
      .from("organizations")
      .update({
        plan: "starter",
        max_employees: 10,
        billing_cycle: null,
        subscription_status: "cancelled",
        stripe_subscription_id: null,
        stripe_customer_id: null,
        subscription_paused_at: null,
      } as any)
      .eq("id", org.id);
    if (updateError) {
      console.error(`billing-grace-period: downgrade failed for ${org.id}`, updateError);
      continue;
    }
    downgraded++;
    console.log(`billing-grace-period: downgraded org ${org.id} (${org.name}) to starter`);
  }

  const { data: warnOrgs, error: warnFetchError } = await supabase
    .from("organizations")
    .select("id, name")
    .in("subscription_status", ["paused", "halted"])
    .gte("subscription_paused_at", warningEnd)
    .lt("subscription_paused_at", warningStart);

  if (warnFetchError) {
    console.error("billing-grace-period: warning fetch error", warnFetchError);
    return NextResponse.json({ error: warnFetchError.message }, { status: 500 });
  }

  let warned = 0;
  for (const org of (warnOrgs ?? []) as { id: string; name: string }[]) {
    const { data: admins } = await supabase
      .from("employees")
      .select("email")
      .eq("org_id", org.id)
      .in("role", ["owner", "admin"])
      .eq("status", "active");

    if (!admins || admins.length === 0) continue;

    try {
      const html = await render(
        SubscriptionGracePeriodEndingEmail({
          orgName: org.name,
          daysRemaining: WARNING_BEFORE_END_DAYS,
          dashboardUrl: "https://jambahr.com/dashboard/settings",
        })
      );
      await resend.emails.send({
        from: FROM_EMAIL,
        to: (admins as { email: string }[]).map((a) => a.email),
        subject: "JambaHR – Your subscription access ends in 3 days",
        html,
      });
      warned++;
    } catch (e) {
      console.error(`billing-grace-period: warning email failed for ${org.id}`, e);
    }
  }

  return NextResponse.json({ downgraded, warned });
}
