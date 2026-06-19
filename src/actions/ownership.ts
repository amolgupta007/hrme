"use server";

import { randomBytes } from "crypto";
import { render } from "@react-email/render";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/current-user";
import { isOwner } from "@/types/index";
import { createAdminSupabase } from "@/lib/supabase/server";
import { resend, FROM_EMAIL, NOREPLY_EMAIL_FROM } from "@/lib/resend";
import { OwnershipTransferEmail } from "@/components/emails/ownership-transfer";
import type { ActionResult } from "@/types";

const TRANSFER_EXPIRY_MS = 14 * 24 * 60 * 60 * 1000;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://jambahr.com";

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function initiateOwnershipTransfer(input: {
  email?: string;
  phone?: string;
  name?: string;
}): Promise<ActionResult<{ transferId: string }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isOwner(user.role)) return { success: false, error: "Only the owner can transfer ownership" };

  const email = input.email?.trim().toLowerCase() || null;
  const phone = input.phone?.trim() || null;
  if (!email && !phone) return { success: false, error: "An email or phone is required" };

  const supabase = createAdminSupabase();

  // current owner's own employee row + identity (to block self-transfer)
  const { data: me } = await supabase
    .from("employees")
    .select("id, email, phone, first_name")
    .eq("id", user.employeeId)
    .single();
  const myEmail = (me as any)?.email?.toLowerCase() ?? null;
  const myPhone = (me as any)?.phone ?? null;
  if ((email && email === myEmail) || (phone && phone === myPhone)) {
    return { success: false, error: "You can't transfer ownership to yourself" };
  }

  // block a second pending transfer
  const { data: existing } = await supabase
    .from("ownership_transfers")
    .select("id")
    .eq("org_id", user.orgId)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) {
    return { success: false, error: "A transfer is already pending. Cancel it before starting a new one." };
  }

  // reuse an existing member row if the identity already belongs to one; else create a placeholder
  let toEmployeeId: string | null = null;
  let placeholderCreated = false;
  const memberQuery = supabase.from("employees").select("id").eq("org_id", user.orgId).neq("status", "terminated");
  const { data: member } = email
    ? await memberQuery.ilike("email", email).maybeSingle()
    : await memberQuery.eq("phone", phone!).maybeSingle();
  if (member) {
    toEmployeeId = (member as any).id;
  } else {
    const { data: created, error: cErr } = await supabase
      .from("employees")
      .insert({
        org_id: user.orgId,
        email,
        phone,
        first_name: input.name?.trim() || "",
        last_name: "",
        role: "admin",
        status: "active",
        clerk_user_id: null,
      })
      .select("id")
      .single();
    if (cErr || !created) return { success: false, error: cErr?.message ?? "Failed to create invitee" };
    toEmployeeId = (created as any).id;
    placeholderCreated = true;
  }

  const token = newToken();
  const { data: transfer, error: tErr } = await supabase
    .from("ownership_transfers")
    .insert({
      org_id: user.orgId,
      from_employee_id: user.employeeId,
      to_employee_id: toEmployeeId,
      to_email: email,
      to_phone: phone,
      token,
      status: "pending",
      expires_at: new Date(Date.now() + TRANSFER_EXPIRY_MS).toISOString(),
    })
    .select("id")
    .single();
  if (tErr || !transfer) {
    if (placeholderCreated && toEmployeeId) {
      await supabase.from("employees").delete().eq("id", toEmployeeId);
    }
    return { success: false, error: tErr?.message ?? "Failed to start transfer" };
  }

  // best-effort claim email (email targets only; phone-only invitees claim after phone sign-in)
  if (email) {
    try {
      const { data: org } = await supabase.from("organizations").select("name").eq("id", user.orgId).single();
      const html = await render(
        OwnershipTransferEmail({
          orgName: (org as any)?.name ?? "your organization",
          inviterName: (me as any)?.first_name || "An admin",
          claimUrl: `${APP_URL}/transfer/${token}`,
        })
      );
      await resend.emails.send({
        from: NOREPLY_EMAIL_FROM,
        to: email,
        replyTo: FROM_EMAIL,
        subject: "You've been invited to take ownership",
        html,
      });
    } catch (err) {
      console.error("[ownership] claim email failed", err);
    }
  }

  revalidatePath("/dashboard/settings");
  return { success: true, data: { transferId: (transfer as any).id } };
}

export async function getActiveOwnershipTransfer(): Promise<
  ActionResult<{ id: string; to_email: string | null; to_phone: string | null; expires_at: string } | null>
> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isOwner(user.role)) return { success: false, error: "Unauthorized" };

  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from("ownership_transfers")
    .select("id, to_email, to_phone, expires_at")
    .eq("org_id", user.orgId)
    .eq("status", "pending")
    .maybeSingle();
  return { success: true, data: (data as any) ?? null };
}

export async function cancelOwnershipTransfer(): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isOwner(user.role)) return { success: false, error: "Unauthorized" };

  const supabase = createAdminSupabase();
  const { data: t } = await supabase
    .from("ownership_transfers")
    .select("id, to_employee_id, status")
    .eq("org_id", user.orgId)
    .eq("status", "pending")
    .maybeSingle();
  if (!t) return { success: false, error: "No pending transfer to cancel" };

  await supabase
    .from("ownership_transfers")
    .update({ status: "cancelled", responded_at: new Date().toISOString() })
    .eq("id", (t as any).id);

  // remove the placeholder if it was created for this transfer and never linked/used
  const { data: inv } = await supabase
    .from("employees")
    .select("id, clerk_user_id, role")
    .eq("id", (t as any).to_employee_id)
    .single();
  if (inv && !(inv as any).clerk_user_id && (inv as any).role === "admin") {
    await supabase.from("employees").delete().eq("id", (inv as any).id);
  }

  revalidatePath("/dashboard/settings");
  return { success: true, data: undefined };
}

export async function resendOwnershipTransfer(): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isOwner(user.role)) return { success: false, error: "Unauthorized" };

  const supabase = createAdminSupabase();
  const { data: t } = await supabase
    .from("ownership_transfers")
    .select("token, to_email")
    .eq("org_id", user.orgId)
    .eq("status", "pending")
    .maybeSingle();
  if (!t || !(t as any).to_email) return { success: false, error: "No emailable pending transfer" };

  try {
    const { data: org } = await supabase.from("organizations").select("name").eq("id", user.orgId).single();
    const { data: me } = await supabase.from("employees").select("first_name").eq("id", user.employeeId).single();
    const html = await render(
      OwnershipTransferEmail({
        orgName: (org as any)?.name ?? "your organization",
        inviterName: (me as any)?.first_name || "An admin",
        claimUrl: `${APP_URL}/transfer/${(t as any).token}`,
      })
    );
    await resend.emails.send({
      from: NOREPLY_EMAIL_FROM,
      to: (t as any).to_email,
      replyTo: FROM_EMAIL,
      subject: "You've been invited to take ownership",
      html,
    });
  } catch (err) {
    return { success: false, error: "Failed to resend email" };
  }
  return { success: true, data: undefined };
}
