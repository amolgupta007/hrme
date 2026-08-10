import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentUser } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import { buildLeavePayload, type RawLeaveRequestRow } from "@/lib/mobile/leave-payload";
import type { LeavePolicyUsage } from "@/lib/mobile/home-payload";

export const dynamic = "force-dynamic";

/**
 * Mobile BFF: the staff Leaves tab. Balances are DERIVED by aggregation
 * (viewer-scoped, current calendar year) — mirrors `listLeavePolicies`
 * exactly; the `leave_balances` table is stale/unwritten (never read). The
 * caller's own requests (≤50, reverse-chron) carry approver attribution:
 * `decidedAt` from `reviewed_at` and `approverName` from the `reviewed_by`
 * join (the web actions don't populate `reviewed_by` yet, so it renders null).
 */
export async function GET(request: NextRequest) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const user = await getCurrentUser({ orgIdHint: request.headers.get("x-org-id") });
  if (!user) {
    return NextResponse.json({ error: "no_membership" }, { status: 403 });
  }

  const supabase = createAdminSupabase();
  const currentYear = new Date().getFullYear();
  const employeeId = user.employeeId;

  const [{ data: policies }, { data: approved }, { data: reqRows }] = await Promise.all([
    supabase
      .from("leave_policies")
      .select("id, name, type, days_per_year")
      .eq("org_id", user.orgId)
      .order("name"),
    employeeId
      ? supabase
          .from("leave_requests")
          .select("policy_id, days")
          .eq("org_id", user.orgId)
          .eq("employee_id", employeeId)
          .eq("status", "approved")
          .gte("start_date", `${currentYear}-01-01`)
          .lte("end_date", `${currentYear}-12-31`)
      : Promise.resolve({ data: [] as { policy_id: string; days: number }[] }),
    employeeId
      ? supabase
          .from("leave_requests")
          .select(
            "id, start_date, end_date, days, status, reason, start_half_day, end_half_day, reviewed_at, leave_policies(name, type), reviewer:employees!reviewed_by(first_name, last_name)",
          )
          .eq("org_id", user.orgId)
          .eq("employee_id", employeeId)
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const usedByPolicy: Record<string, number> = {};
  for (const r of (approved as { policy_id: string; days: number }[] | null) ?? []) {
    usedByPolicy[r.policy_id] = (usedByPolicy[r.policy_id] ?? 0) + Number(r.days);
  }
  const policyUsage: LeavePolicyUsage[] = ((policies as any[]) ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    days_per_year: Number(p.days_per_year),
    used: usedByPolicy[p.id] ?? 0,
  }));

  const requests: RawLeaveRequestRow[] = ((reqRows as any[]) ?? []).map((r) => {
    const rev = r.reviewer ?? null;
    const approverName = rev
      ? `${rev.first_name ?? ""} ${rev.last_name ?? ""}`.trim() || null
      : null;
    return {
      id: r.id,
      start_date: r.start_date,
      end_date: r.end_date,
      days: r.days,
      status: r.status,
      reason: r.reason ?? null,
      start_half_day: r.start_half_day,
      end_half_day: r.end_half_day,
      reviewed_at: r.reviewed_at ?? null,
      policyName: r.leave_policies?.name ?? "Leave",
      type: r.leave_policies?.type ?? "custom",
      approverName,
    };
  });

  return NextResponse.json(buildLeavePayload({ policies: policyUsage, requests }));
}
