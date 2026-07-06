import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentUser } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import {
  buildMePayload,
  type MeEmployeeRow,
  type MeMembershipRow,
} from "@/lib/mobile/me-payload";

export const dynamic = "force-dynamic";

/**
 * Mobile BFF: identity + active-org context for the signed-in user.
 * Auth: Clerk session token via `Authorization: Bearer` (clerkMiddleware
 * verifies it). Org selection: optional `X-Org-Id` header, validated
 * against real memberships (same semantics as the web active-org cookie).
 */
export async function GET(request: NextRequest) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const user = await getCurrentUser({
    orgIdHint: request.headers.get("x-org-id"),
  });
  if (!user) {
    // Signed in but no org membership (web equivalent: /onboarding redirect)
    return NextResponse.json({ error: "no_membership" }, { status: 403 });
  }

  const supabase = createAdminSupabase();

  let employeeRow: MeEmployeeRow = null;
  if (user.employeeId) {
    const { data } = await supabase
      .from("employees")
      .select("id, first_name, last_name, email, phone, employment_type")
      .eq("id", user.employeeId)
      .eq("org_id", user.orgId)
      .maybeSingle();
    employeeRow = (data as MeEmployeeRow) ?? null;
  }

  const { data: membershipData } = await supabase
    .from("employees")
    .select("org_id, role, organizations!inner(id, name)")
    .eq("clerk_user_id", userId)
    .neq("status", "terminated")
    .order("created_at", { ascending: true });
  const membershipRows = (membershipData ?? []) as unknown as MeMembershipRow[];

  return NextResponse.json(buildMePayload(user, employeeRow, membershipRows));
}
