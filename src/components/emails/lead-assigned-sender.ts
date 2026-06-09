import { render } from "@react-email/render";
import { resend, FROM_EMAIL } from "@/lib/resend";
import { createAdminSupabase } from "@/lib/supabase/server";
import LeadAssignedEmail from "./lead-assigned";

interface Args {
  leadId: string;
  assigneeId: string;
}

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? "https://jambahr.com";

export async function sendLeadAssignedEmail({ leadId, assigneeId }: Args): Promise<void> {
  try {
    const sb = createAdminSupabase();

    const { data: lead } = await sb
      .from("leads")
      .select("id, org_id, name, company, contact_phone, address, value_inr, created_by")
      .eq("id", leadId)
      .maybeSingle();
    if (!lead) return;

    const [
      { data: assignee },
      { data: assigner },
      { data: org },
    ] = await Promise.all([
      sb.from("employees").select("first_name, last_name, email").eq("id", assigneeId).maybeSingle(),
      lead.created_by
        ? sb.from("employees").select("first_name, last_name").eq("id", lead.created_by).maybeSingle()
        : Promise.resolve({ data: null }),
      sb.from("organizations").select("name").eq("id", lead.org_id).maybeSingle(),
    ]);

    if (!assignee?.email) return;

    const assigneeName = `${assignee.first_name ?? ""} ${assignee.last_name ?? ""}`.trim() || "there";
    const assignerName = assigner
      ? `${assigner.first_name ?? ""} ${assigner.last_name ?? ""}`.trim() || "An admin"
      : "An admin";

    const html = await render(
      LeadAssignedEmail({
        assigneeName,
        assignerName,
        leadName: lead.name,
        leadCompany: lead.company,
        leadContact: lead.contact_phone,
        leadAddress: lead.address,
        leadValueInr: lead.value_inr,
        deepLinkUrl: `${APP_ORIGIN}/geo/leads/${lead.id}`,
        orgName: org?.name ?? "your team",
      }),
    );

    await resend.emails.send({
      from: FROM_EMAIL,
      to: assignee.email,
      subject: `${assignerName} assigned you a new lead: ${lead.name}`,
      html,
    });
  } catch (err) {
    console.error("[jambageo] sendLeadAssignedEmail failed", err);
  }
}
