// Plain module (NOT "use server" — see CLAUDE.md gotcha #85): shared by the
// sendInvite server action and bulkImportEmployees so both paths send the same
// account-setup email and record it in employee_invites.
import { render } from "@react-email/render";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resend, FROM_EMAIL } from "@/lib/resend";
import { AccountSetupEmail } from "@/components/emails/account-setup";

const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type SendAccountSetupResult = { ok: true } | { ok: false; error: string };

export async function sendAccountSetupInvite(
  supabase: SupabaseClient,
  input: {
    orgId: string;
    orgName: string;
    employeeId: string;
    email: string;
    firstName: string | null;
  }
): Promise<SendAccountSetupResult> {
  const signInUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://jambahr.com"}/sign-in`;
  try {
    const html = await render(
      AccountSetupEmail({
        orgName: input.orgName,
        firstName: input.firstName ?? "there",
        signInUrl,
      })
    );
    await resend.emails.send({
      from: FROM_EMAIL,
      to: input.email,
      subject: "Set up your JambaHR account",
      html,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send invite email";
    console.warn(`Account-setup invite failed for employee ${input.employeeId}:`, message);
    return { ok: false, error: message };
  }

  await supabase.from("employee_invites").upsert(
    {
      org_id: input.orgId,
      employee_id: input.employeeId,
      email: input.email,
      clerk_invitation_id: null,
      sent_at: new Date().toISOString(),
      accepted_at: null,
      expires_at: new Date(Date.now() + INVITE_EXPIRY_MS).toISOString(),
    },
    { onConflict: "employee_id" }
  );

  return { ok: true };
}
