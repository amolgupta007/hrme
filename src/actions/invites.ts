"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import type { ActionResult } from "@/types";

const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Helper: get org context for invite actions
async function getOrgContext(): Promise<{
  internalOrgId: string;
  clerkOrgId: string;
  clerkUserId: string;
} | null> {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.role)) return null;

  const { orgId, userId } = auth();
  let clerkOrgId = orgId ?? null;

  if (!clerkOrgId && userId) {
    const client = await clerkClient();
    const memberships = await client.users.getOrganizationMembershipList({ userId: userId! });
    clerkOrgId = memberships.data[0]?.organization.id ?? null;
  }
  if (!clerkOrgId || !userId) return null;

  return {
    internalOrgId: user.orgId!,
    clerkOrgId,
    clerkUserId: userId,
  };
}

export async function sendInvite(employeeId: string): Promise<ActionResult<void>> {
  const ctx = await getOrgContext();
  if (!ctx) return { success: false, error: "Unauthorized" };

  const supabase = createAdminSupabase();

  const { data: emp } = await supabase
    .from("employees")
    .select("id, email, role, clerk_user_id")
    .eq("id", employeeId)
    .eq("org_id", ctx.internalOrgId)
    .single();

  if (!emp) return { success: false, error: "Employee not found" };
  if ((emp as any).clerk_user_id) return { success: false, error: "Employee already has an active account" };

  const email = (emp as any).email as string;
  const role = (emp as any).role as string;

  const client = await clerkClient();
  let clerkInvitationId: string | null = null;
  try {
    const invitation = await client.organizations.createOrganizationInvitation({
      organizationId: ctx.clerkOrgId,
      emailAddress: email,
      role: role === "admin" || role === "owner" ? "org:admin" : "org:member",
      redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://jambahr.com"}/dashboard`,
    });
    clerkInvitationId = invitation.id;
  } catch (err: any) {
    return { success: false, error: err?.errors?.[0]?.message ?? err?.message ?? "Failed to send invite" };
  }

  await supabase.from("employee_invites").upsert(
    {
      org_id: ctx.internalOrgId,
      employee_id: employeeId,
      email,
      clerk_invitation_id: clerkInvitationId,
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

  const supabase = createAdminSupabase();

  const { data: existing } = await supabase
    .from("employee_invites")
    .select("clerk_invitation_id")
    .eq("employee_id", employeeId)
    .single();

  if (existing && (existing as any).clerk_invitation_id) {
    try {
      const client = await clerkClient();
      await client.organizations.revokeOrganizationInvitation({
        organizationId: ctx.clerkOrgId,
        invitationId: (existing as any).clerk_invitation_id,
        requestingUserId: ctx.clerkUserId,
      });
    } catch {
      // Best-effort — old invite may already be expired/revoked
    }
  }

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
