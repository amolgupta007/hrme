"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { sendAccountSetupInvite } from "@/lib/invites/send-account-setup";
import type { ActionResult } from "@/types";

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

  if (!(emp as any).email) {
    return { success: false, error: "This employee signs in by phone — no email invite needed." };
  }

  // clerk_user_id is set eagerly at provisioning time (syncEmployeeAuthIdentifiers
  // runs when an employee is added with a phone) — it does NOT mean the person
  // ever signed in. Only block the invite for accounts that were actually used;
  // if the Clerk lookup fails, send anyway (a duplicate invite is harmless,
  // a silently missing one is not).
  if ((emp as any).clerk_user_id) {
    try {
      const client = await clerkClient();
      const clerkUser = await client.users.getUser((emp as any).clerk_user_id);
      if (clerkUser.lastSignInAt) {
        return { success: false, error: "Employee has already signed in — no invite needed" };
      }
    } catch (err: any) {
      console.warn(
        `sendInvite: Clerk lookup failed for employee ${employeeId} (sending anyway):`,
        err?.message ?? err
      );
    }
  }

  // Send our own account-setup email. The invitee signs in with this email and
  // getCurrentUser's auto-link backfills their clerk_user_id onto this row —
  // there is no Clerk org to join.
  const sent = await sendAccountSetupInvite(supabase, {
    orgId: ctx.internalOrgId,
    orgName: ctx.orgName,
    employeeId,
    email: (emp as any).email as string,
    firstName: (emp as any).first_name ?? null,
  });
  if (!sent.ok) return { success: false, error: sent.error };

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
