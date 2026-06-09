import { NextResponse } from "next/server";
import { render } from "@react-email/render";
import { createAdminSupabase } from "@/lib/supabase/server";
import { resend, FROM_EMAIL } from "@/lib/resend";
import LeadFollowupReminderEmail from "@/components/emails/lead-followup-reminder";

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? "https://jambahr.com";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createAdminSupabase();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC

  // Query lead_visits where follow_up_date = today, joining lead + assignee.
  // FK names confirmed from existing getOverdueFollowUps in geo-reports.ts.
  const { data, error } = await sb
    .from("lead_visits")
    .select(
      `follow_up_date, org_id,
       lead:leads!lead_visits_lead_id_fkey(
         id, name, company, org_id, assigned_to,
         assignee:employees!leads_assigned_to_fkey(email, first_name, last_name)
       )`
    )
    .eq("follow_up_date", today)
    .not("follow_up_date", "is", null);

  if (error) {
    console.error("[jambageo] followup-reminders query failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Array<{
    org_id: string;
    lead: {
      id: string;
      name: string;
      company: string | null;
      org_id: string;
      assigned_to: string | null;
      assignee: { email: string; first_name: string; last_name: string } | null;
    } | null;
  }>;

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  // Collect unique org_ids to fetch org names in one round-trip
  const orgIds = [...new Set(rows.map((r) => r.lead?.org_id).filter(Boolean))] as string[];
  const { data: orgs } = await sb
    .from("organizations")
    .select("id, name")
    .in("id", orgIds);
  const orgNameById = new Map<string, string>(
    (orgs ?? []).map((o: any) => [o.id, o.name as string])
  );

  // Group by assignee email — one digest email per recipient
  type Recipient = {
    recipientName: string;
    orgName: string;
    leads: Array<{ name: string; company: string | null; url: string }>;
  };
  const grouped = new Map<string, Recipient>();

  for (const row of rows) {
    const lead = row.lead;
    if (!lead || !lead.assignee?.email) continue;

    const email = lead.assignee.email;
    if (!grouped.has(email)) {
      const firstName = lead.assignee.first_name ?? "";
      const lastName = lead.assignee.last_name ?? "";
      grouped.set(email, {
        recipientName: `${firstName} ${lastName}`.trim() || "there",
        orgName: orgNameById.get(lead.org_id) ?? "your team",
        leads: [],
      });
    }
    grouped.get(email)!.leads.push({
      name: lead.name,
      company: lead.company,
      url: `${APP_ORIGIN}/dashboard/geo/leads/${lead.id}`,
    });
  }

  let sent = 0;
  for (const [email, info] of grouped.entries()) {
    try {
      const html = await render(
        LeadFollowupReminderEmail({
          recipientName: info.recipientName,
          leads: info.leads,
          orgName: info.orgName,
        })
      );
      await resend.emails.send({
        from: FROM_EMAIL,
        to: email,
        subject: `Follow-ups due today (${info.leads.length})`,
        html,
      });
      sent++;
    } catch (err) {
      console.error("[jambageo] followup-reminder email failed for", email, err);
    }
  }

  return NextResponse.json({ ok: true, sent });
}
