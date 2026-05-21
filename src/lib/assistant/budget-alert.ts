import { render } from "@react-email/render";
import { resend, FROM_EMAIL } from "@/lib/resend";
import { createAdminSupabase } from "@/lib/supabase/server";
import AssistantBudgetAlertEmail from "@/components/emails/assistant-budget-alert";

export async function sendBudgetAlert(args: {
  orgId: string;
  orgName: string;
  usedPaise: number;
  capPaise: number;
  kind: "soft" | "hard";
}): Promise<void> {
  try {
    const supabase = createAdminSupabase();
    const { data: admins } = await supabase
      .from("employees")
      .select("email")
      .eq("org_id", args.orgId)
      .in("role", ["owner", "admin"])
      .neq("status", "terminated");
    const to = (admins ?? [])
      .map((a) => (a as { email: string | null }).email)
      .filter((e): e is string => !!e);
    if (to.length === 0) return;

    const html = await render(
      AssistantBudgetAlertEmail({
        orgName: args.orgName,
        usedInr: Math.round(args.usedPaise / 100),
        capInr: Math.round(args.capPaise / 100),
        kind: args.kind,
      })
    );
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject:
        args.kind === "hard"
          ? "Your JambaHR AI assistant is paused for this month"
          : "You've used 80% of this month's AI assistant budget",
      html,
    });
  } catch (err) {
    // Best-effort — never block the chat path.
    console.error("sendBudgetAlert failed:", err);
  }
}
