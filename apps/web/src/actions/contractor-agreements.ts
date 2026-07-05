// src/actions/contractor-agreements.ts
"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import type { ActionResult } from "@/types";
import { defaultAgreementTitle, buildAgreementBody, isAgreementExpired } from "@/lib/contractor/agreement-templates";

const SendSchema = z.object({
  engagement_id: z.string().uuid(),
  agreement_type: z.enum(["service", "nda", "ip_assignment"]),
  ip_ownership: z.enum(["work_for_hire", "licensed", "na"]).default("na"),
  title: z.string().min(1).optional(),
  body_text: z.string().min(1).optional(),
  expires_in_days: z.number().int().positive().max(365).optional(),
});

export async function sendContractorAgreement(
  input: z.infer<typeof SendSchema>
): Promise<ActionResult<{ id: string; token: string; url: string }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };

  const parsed = SendSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  const p = parsed.data;

  const supabase = createAdminSupabase();

  // Engagement + contractor name (org-scoped).
  // NOTE: Using `as any` cast for employees embed to avoid Supabase v2 never-inference
  // on nested embeds (gotcha #3). Same pattern as listContractorEngagements in contractors.ts.
  const { data: eng } = await supabase
    .from("contractor_engagements")
    .select("id, employee_id, employees!employee_id ( first_name, last_name, email )")
    .eq("id", p.engagement_id)
    .eq("org_id", user.orgId)
    .maybeSingle();
  if (!eng) return { success: false, error: "Engagement not found" };
  const e = eng as any;
  const contractorName = `${e.employees?.first_name ?? ""} ${e.employees?.last_name ?? ""}`.trim() || "Contractor";
  const contractorEmail = e.employees?.email ?? null;

  // Org name.
  const { data: org } = await supabase.from("organizations").select("name").eq("id", user.orgId).single();
  const orgName = (org as any)?.name ?? "Company";

  // Supersede prior 'sent' rows + compute next version for this (engagement, type).
  const { data: priors } = await supabase
    .from("contractor_agreements")
    .select("id, version, status")
    .eq("org_id", user.orgId)
    .eq("contractor_engagement_id", p.engagement_id)
    .eq("agreement_type", p.agreement_type)
    .order("version", { ascending: false });
  const priorRows = (priors ?? []) as any[];
  const nextVersion = priorRows.length ? (priorRows[0].version as number) + 1 : 1;
  const supersedeIds = priorRows.filter((r) => r.status === "sent").map((r) => r.id);
  if (supersedeIds.length) {
    await supabase.from("contractor_agreements").update({ status: "superseded" } as any).in("id", supersedeIds);
  }

  const { randomBytes } = await import("node:crypto");
  const token = randomBytes(32).toString("base64url");
  const title = p.title?.trim() || defaultAgreementTitle(p.agreement_type);
  const body = p.body_text?.trim() || buildAgreementBody({ type: p.agreement_type, orgName, contractorName, ipOwnership: p.ip_ownership });
  const expiresAt = p.expires_in_days
    ? new Date(Date.now() + p.expires_in_days * 86_400_000).toISOString()
    : null;

  const { data: row, error } = await supabase
    .from("contractor_agreements")
    .insert({
      org_id: user.orgId,
      contractor_engagement_id: p.engagement_id,
      agreement_type: p.agreement_type,
      ip_ownership: p.ip_ownership,
      title,
      body_text: body,
      version: nextVersion,
      agreement_token: token,
      status: "sent",
      expires_at: expiresAt,
    } as any)
    .select("id")
    .single();
  if (error || !row) return { success: false, error: error?.message ?? "Failed to create agreement" };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://jambahr.com";
  const url = `${appUrl}/agreements/${token}`;

  // Best-effort email (never blocks).
  if (contractorEmail) {
    try {
      const { resend, NOREPLY_EMAIL, FROM_EMAIL } = await import("@/lib/resend");
      const { render } = await import("@react-email/render");
      // TODO(Task 4): email template — dynamic import handles missing module gracefully
      const { ContractorAgreementEmail } = await import("@/components/emails/contractor-agreement");
      const html = await render(ContractorAgreementEmail({ contractorName, orgName, title, agreementUrl: url }));
      await resend.emails.send({
        from: NOREPLY_EMAIL,
        to: contractorEmail,
        replyTo: FROM_EMAIL,
        subject: `Please review and sign: ${title} — ${orgName}`,
        html,
      });
    } catch (err) {
      console.error("Contractor agreement email failed:", err);
    }
  }

  revalidatePath("/dashboard/contractors");
  return { success: true, data: { id: (row as any).id, token, url } };
}

export async function listEngagementAgreements(): Promise<ActionResult<any[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("contractor_agreements")
    .select("id, contractor_engagement_id, agreement_type, ip_ownership, title, version, status, sent_at, signed_at, signed_by_name, expires_at")
    .eq("org_id", user.orgId)
    .order("version", { ascending: false });
  if (error) return { success: false, error: error.message };

  // Latest row per (engagement, type) — first seen wins (already version-desc).
  const seen = new Set<string>();
  const latest: any[] = [];
  for (const r of (data ?? []) as any[]) {
    const key = `${r.contractor_engagement_id}:${r.agreement_type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    latest.push(r);
  }
  return { success: true, data: latest };
}

export async function getAgreementByToken(token: string): Promise<ActionResult<any>> {
  if (!token) return { success: false, error: "Missing token" };
  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("contractor_agreements")
    .select("id, org_id, contractor_engagement_id, agreement_type, ip_ownership, title, body_text, status, signed_at, signed_by_name, expires_at")
    .eq("agreement_token", token)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: "Agreement not found" };
  const a = data as any;

  // Contractor + org names for display.
  // NOTE: Using `as any` cast for employees embed to avoid Supabase v2 never-inference
  // on nested embeds (gotcha #3). Same pattern as listContractorEngagements in contractors.ts.
  const { data: eng } = await supabase
    .from("contractor_engagements")
    .select("employees!employee_id ( first_name, last_name )")
    .eq("id", a.contractor_engagement_id)
    .maybeSingle();
  const { data: org } = await supabase.from("organizations").select("name").eq("id", a.org_id).single();
  const contractorName = `${(eng as any)?.employees?.first_name ?? ""} ${(eng as any)?.employees?.last_name ?? ""}`.trim() || "Contractor";

  let status = a.status as string;
  if (status === "sent" && isAgreementExpired(a.expires_at)) status = "expired";

  return {
    success: true,
    data: {
      id: a.id,
      orgName: (org as any)?.name ?? "Company",
      contractorName,
      agreement_type: a.agreement_type,
      ip_ownership: a.ip_ownership,
      title: a.title,
      body_text: a.body_text,
      status,
      signed_at: a.signed_at,
      signed_by_name: a.signed_by_name,
      expires_at: a.expires_at,
    },
  };
}

export async function signAgreement(token: string, signedByName: string): Promise<ActionResult<{ status: "signed" }>> {
  if (!token) return { success: false, error: "Missing token" };
  const name = (signedByName ?? "").trim();
  if (name.length < 2) return { success: false, error: "Please type your full legal name to sign" };

  const supabase = createAdminSupabase();
  const { data: a, error } = await supabase
    .from("contractor_agreements")
    .select("id, org_id, status, expires_at")
    .eq("agreement_token", token)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!a) return { success: false, error: "Agreement not found" };
  const row = a as any;
  if (row.status !== "sent") return { success: false, error: `This agreement is ${row.status} and can no longer be signed.` };
  if (isAgreementExpired(row.expires_at)) {
    await supabase.from("contractor_agreements").update({ status: "expired" } as any).eq("id", row.id);
    return { success: false, error: "This agreement link has expired." };
  }

  const { headers } = await import("next/headers");
  const h = headers();
  const ip = h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "unknown";
  const userAgent = h.get("user-agent") ?? "unknown";

  const { error: upErr } = await supabase
    .from("contractor_agreements")
    .update({ status: "signed", signed_at: new Date().toISOString(), signed_by_name: name, ip_address: ip, user_agent: userAgent } as any)
    .eq("id", row.id)
    .eq("org_id", row.org_id);
  if (upErr) return { success: false, error: upErr.message };

  revalidatePath("/dashboard/contractors");
  return { success: true, data: { status: "signed" } };
}

export async function declineAgreement(token: string): Promise<ActionResult<{ status: "declined" }>> {
  if (!token) return { success: false, error: "Missing token" };
  const supabase = createAdminSupabase();
  const { data: a } = await supabase
    .from("contractor_agreements")
    .select("id, org_id, status")
    .eq("agreement_token", token)
    .maybeSingle();
  if (!a) return { success: false, error: "Agreement not found" };
  const row = a as any;
  if (row.status !== "sent") return { success: false, error: `This agreement is ${row.status}.` };
  const { error } = await supabase.from("contractor_agreements").update({ status: "declined" } as any).eq("id", row.id).eq("org_id", row.org_id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/contractors");
  return { success: true, data: { status: "declined" } };
}
