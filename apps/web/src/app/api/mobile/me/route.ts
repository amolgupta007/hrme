import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { resolveMobileUser } from "@/lib/mobile/auth";
import { createAdminSupabase } from "@/lib/supabase/server";
import {
  buildMePayload,
  type MeEmployeeRow,
  type MeMembershipRow,
} from "@/lib/mobile/me-payload";
import { loadLocationPunchSettings } from "@/lib/attendance/location-punch";

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

  // 403 no_membership = looked, found no org (web equivalent: /onboarding).
  // 503 service_unavailable = could not look at all. This route decides the
  // app's whole top-level state, so conflating the two showed "no workspace"
  // during a database outage.
  const resolved = await resolveMobileUser(request);
  if (!resolved.ok) return resolved.response;
  const user = resolved.user;

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

  const [{ data: membershipData }, locationPunch] = await Promise.all([
    supabase
      .from("employees")
      .select("org_id, role, organizations!inner(id, name)")
      .eq("clerk_user_id", userId)
      .neq("status", "terminated")
      .order("created_at", { ascending: true }),
    // Surfaced here so the app can request location permission with context
    // *before* the first punch, rather than interrupting one mid-tap.
    loadLocationPunchSettings(supabase, user.orgId),
  ]);
  const membershipRows = (membershipData ?? []) as unknown as MeMembershipRow[];

  return NextResponse.json(
    buildMePayload(user, employeeRow, membershipRows, locationPunch),
  );
}
