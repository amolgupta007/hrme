import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { hasFeature, type OrgPlan } from "@/config/plans";
import type { UserRole } from "@/types";

export interface JambaGeoAccessContext {
  orgId: string;
  clerkUserId: string;
  role: UserRole;
  employeeId: string | null;
  plan: OrgPlan;
}

/**
 * Server-action guard. Returns the auth context if the caller may use JambaGeo
 * at all (any role); returns null when the caller is unauthenticated or the
 * feature is not enabled for this org/plan.
 */
export async function getJambaGeoContext(): Promise<JambaGeoAccessContext | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!hasFeature(user.plan ?? "starter", "jambageo")) return null;
  if (!user.jambaGeoEnabled) return null;
  return {
    orgId: user.orgId,
    clerkUserId: user.clerkUserId,
    role: user.role,
    employeeId: user.employeeId,
    plan: user.plan,
  };
}

/**
 * Page-level guard. Redirects to /dashboard/settings if the plan/flag check
 * fails (Business gate / org-toggle off). Use from server components only.
 */
export async function requireJambaGeoAccess(): Promise<JambaGeoAccessContext> {
  const ctx = await getJambaGeoContext();
  if (!ctx) redirect("/dashboard/settings#jambageo");
  return ctx;
}

/**
 * Admin-only variant of requireJambaGeoAccess. Use for geofence/settings pages.
 */
export async function requireJambaGeoAdminContext(): Promise<JambaGeoAccessContext> {
  const ctx = await requireJambaGeoAccess();
  if (!isAdmin(ctx.role)) redirect("/geo/leads");
  return ctx;
}
