import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { render } from "@react-email/render";
import { getCurrentUser } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import { resend, FROM_EMAIL } from "@/lib/resend";
import { AccountDeletionRequestEmail } from "@/components/emails/account-deletion-request";
import {
  AccountDeletionRequestBodySchema,
  type MobileDeletionRequest,
} from "@/lib/mobile/account-payload";

export const dynamic = "force-dynamic";

/**
 * Mobile BFF: account-deletion REQUEST (Phase D Slice 3, Stage C).
 *
 * JambaHR is B2B — "Delete my account" does NOT hard-delete the employee row
 * (that would break attendance/payroll history + the admin's records). It
 * records a pending request for the caller (self by construction) and emails
 * the org's owners/admins, who offboard via the existing terminate flow. This
 * satisfies Apple's App Store requirement that a user can INITIATE deletion
 * in-app, without destroying org data.
 *
 * POST — create (or idempotently return) the caller's pending request.
 * GET  — return the caller's current pending request, or null.
 */

async function requireCaller(request: NextRequest) {
  const { userId } = auth();
  if (!userId) {
    return { error: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) } as const;
  }
  const user = await getCurrentUser({ orgIdHint: request.headers.get("x-org-id") });
  if (!user) {
    return { error: NextResponse.json({ error: "no_membership" }, { status: 403 }) } as const;
  }
  if (!user.employeeId) {
    return { error: NextResponse.json({ error: "no_employee" }, { status: 403 }) } as const;
  }
  return { user } as const;
}

export async function GET(request: NextRequest) {
  const gate = await requireCaller(request);
  if ("error" in gate) return gate.error;
  const { user } = gate;

  const supabase = createAdminSupabase();
  const { data: existing } = await supabase
    .from("account_deletion_requests")
    .select("requested_at")
    .eq("org_id", user.orgId)
    .eq("employee_id", user.employeeId)
    .eq("status", "pending")
    .maybeSingle();

  const requestPayload: MobileDeletionRequest | null = existing
    ? { status: "pending", requestedAt: (existing as { requested_at: string }).requested_at }
    : null;
  return NextResponse.json({ request: requestPayload });
}

export async function POST(request: NextRequest) {
  const gate = await requireCaller(request);
  if ("error" in gate) return gate.error;
  const { user } = gate;

  const body = await request.json().catch(() => ({}));
  const parsed = AccountDeletionRequestBodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "invalid_body" },
      { status: 400 },
    );
  }
  const reason = parsed.data.reason && parsed.data.reason.length > 0 ? parsed.data.reason : null;

  const supabase = createAdminSupabase();

  // Pre-check: one open request per person (the partial unique index is the
  // hard guard; this avoids a noisy insert on the common repeat-tap path).
  const { data: existing } = await supabase
    .from("account_deletion_requests")
    .select("requested_at")
    .eq("org_id", user.orgId)
    .eq("employee_id", user.employeeId)
    .eq("status", "pending")
    .maybeSingle();

  let requestedAt: string;
  if (existing) {
    requestedAt = (existing as { requested_at: string }).requested_at;
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from("account_deletion_requests")
      .insert({
        org_id: user.orgId,
        employee_id: user.employeeId,
        status: "pending",
        note: reason,
      })
      .select("requested_at")
      .single();

    if (insertError) {
      // 23505 = unique violation on the pending partial index → a concurrent
      // request already exists. Treat as idempotent success: re-read it.
      if ((insertError as { code?: string }).code === "23505") {
        const { data: raced } = await supabase
          .from("account_deletion_requests")
          .select("requested_at")
          .eq("org_id", user.orgId)
          .eq("employee_id", user.employeeId)
          .eq("status", "pending")
          .maybeSingle();
        requestedAt =
          (raced as { requested_at: string } | null)?.requested_at ?? new Date().toISOString();
      } else {
        return NextResponse.json({ error: insertError.message }, { status: 400 });
      }
    } else {
      requestedAt = (inserted as { requested_at: string }).requested_at;
      // Notify the org's owners/admins — best-effort, never fails the request.
      await notifyAdmins(supabase, user.orgId, user.orgName, user.employeeId);
    }
  }

  const payload: MobileDeletionRequest = { status: "pending", requestedAt };
  return NextResponse.json(payload);
}

/**
 * Email the org's non-terminated owners/admins about the deletion request.
 * Mirrors the referral-received recipient lookup + send. Best-effort: any
 * failure (no recipients, Resend down, missing API key) is swallowed so the
 * request itself always succeeds.
 */
async function notifyAdmins(
  supabase: ReturnType<typeof createAdminSupabase>,
  orgId: string,
  orgName: string,
  employeeId: string,
): Promise<void> {
  try {
    const [{ data: admins }, { data: requester }] = await Promise.all([
      supabase
        .from("employees")
        .select("email")
        .eq("org_id", orgId)
        .in("role", ["owner", "admin"])
        .neq("status", "terminated"),
      supabase
        .from("employees")
        .select("first_name, last_name")
        .eq("id", employeeId)
        .maybeSingle(),
    ]);

    const adminEmails = ((admins ?? []) as { email: string | null }[])
      .map((a) => a.email)
      .filter((e): e is string => typeof e === "string" && e.length > 0);
    if (adminEmails.length === 0) return;

    const r = requester as { first_name: string | null; last_name: string | null } | null;
    const employeeName =
      [r?.first_name, r?.last_name].filter(Boolean).join(" ").trim() || "An employee";

    const html = await render(AccountDeletionRequestEmail({ employeeName, orgName }));
    await resend.emails.send({
      from: FROM_EMAIL,
      to: adminEmails,
      subject: `${employeeName} requested account deletion`,
      html,
    });
  } catch (err) {
    console.error("[account/deletion-request] admin notify failed", err);
  }
}
