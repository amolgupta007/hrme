"use server";

import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { createAdminSupabase } from "@/lib/supabase/server";
import { ACTIVE_ORG_COOKIE } from "@/lib/auth/active-org";
import type { ActionResult } from "@/types";

export type OrgMembership = { orgId: string; name: string; role: string };

/**
 * The caller's full org membership list, for the org switcher.
 * One entry per non-terminated `employees` row linked to the Clerk user,
 * ordered deterministically by membership creation (oldest first) so the
 * default active org matches `getCurrentUser`'s first-membership fallback.
 */
export async function getMyOrgs(): Promise<OrgMembership[]> {
  const { userId } = auth();
  if (!userId) return [];
  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from("employees")
    .select("role, org_id, organizations!inner(id, name)")
    .eq("clerk_user_id", userId)
    .neq("status", "terminated")
    .order("created_at", { ascending: true });
  return ((data ?? []) as any[]).map((r) => ({
    orgId: r.org_id as string,
    name: r.organizations?.name as string,
    role: r.role as string,
  }));
}

/**
 * Switch the caller's active org by writing the `active_org_id` cookie hint.
 * The cookie is only ever a hint — `getCurrentUser` re-validates it against
 * real `employees` membership on every request. We still authority-check here
 * so a tampered request can't even set a cookie for an org the caller isn't in.
 */
export async function switchActiveOrg(orgId: string): Promise<ActionResult<void>> {
  const { userId } = auth();
  if (!userId) return { success: false, error: "Not authenticated" };
  const supabase = createAdminSupabase();
  // Authority check: the caller MUST have a (non-terminated) membership in orgId.
  const { data: member } = await supabase
    .from("employees")
    .select("id")
    .eq("clerk_user_id", userId)
    .eq("org_id", orgId)
    .neq("status", "terminated")
    .maybeSingle();
  if (!member) return { success: false, error: "You are not a member of that organization" };

  cookies().set(ACTIVE_ORG_COOKIE, orgId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return { success: true, data: undefined };
}
