"use server";

import { revalidatePath } from "next/cache";
import { render } from "@react-email/render";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { resend, FROM_EMAIL } from "@/lib/resend";
import { AccountSetupEmail } from "@/components/emails/account-setup";
import type { ActionResult } from "@/types";

const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Helper: get org context for invite actions. Org membership now lives entirely
// in our `employees` table (Clerk Organizations decoupled), so the active org
// comes from getCurrentUser — no Clerk org lookup.
async function getOrgContext(): Promise<{
  internalOrgId: string;
  orgName: string;
} | null> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.role)) return null;
  return {
    internalOrgId: user.orgId!,
    orgName: user.orgName ?? "your team",
  };
}

export async function sendInvite(employeeId: string): Promise<ActionResult<void>> {
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Unauthorized" };

  const supabase = createAdminSupabase();

  const { data: emp } = await supabase
    .from("employees")
    .select("id, email, first_name, role, clerk_user_id")
    .eq("id", employeeId)
    .eq("org_id", ctx.internalOrgId)
    .single();

  if (!emp) return { success: false, error: "Employee not found" };
  if ((emp as any).clerk_user_id) return { success: false, error: "Employee already has an active account" };

  if (!(emp as any).email) {
    return { success: false, error: "This employee signs in by phone — no email invite needed." };
  }

  const email = (emp as any).email as string;

  // Send our own account-setup email. The invitee signs in with this email and
  // getCurrentUser's auto-link backfills their clerk_user_id onto this row —
  // there is no Clerk org to join.
  const signInUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://jambahr.com"}/sign-in`;
  try {
    const html = await render(
      AccountSetupEmail({
        orgName: ctx.orgName,
        firstName: (emp as any).first_name ?? "there",
        signInUrl,
      })
    );
    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: "Set up your JambaHR account",
      html,
    });
  } catch (err: any) {
    return { success: false, error: err?.message ?? "Failed to send invite email" };
  }

  await supabase.from("employee_invites").upsert(
    {
      org_id: ctx.internalOrgId,
      employee_id: employeeId,
      email,
      clerk_invitation_id: null,
      sent_at: new Date().toISOString(),
      accepted_at: null,
      expires_at: new Date(Date.now() + INVITE_EXPIRY_MS).toISOString(),
    },
    { onConflict: "employee_id" }
  );

  revalidatePath("/dashboard/employees");
  return { success: true, data: undefined };
}

export async function resendInvite(employeeId: string): Promise<ActionResult<void>> {
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Unauthorized" };

  // No Clerk invitation to revoke anymore — just send a fresh account-setup email.
  return sendInvite(employeeId);
}

export async function sendBulkInvites(
  employeeIds: string[]
): Promise<ActionResult<{ sent: number; failed: string[] }>> {
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Unauthorized" };

  const results = await Promise.allSettled(employeeIds.map((id) => sendInvite(id)));

  const sent = results.filter((r) => r.status === "fulfilled" && (r as any).value.success).length;
  const failed = results
    .map((r, i) => {
      if (r.status === "rejected") return employeeIds[i];
      if (r.status === "fulfilled" && !(r as any).value.success) return employeeIds[i];
      return null;
    })
    .filter((x): x is string => x !== null);

  revalidatePath("/dashboard/employees");
  return { success: true, data: { sent, failed } };
}
