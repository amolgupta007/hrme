// src/lib/screening/budget.ts
import { createAdminSupabase } from "@/lib/supabase/server";
import type { OrgPlan } from "@/config/plans";

// Mirror assistant PLAN_BUDGET_PAISE; screening shares the Business posture.
const PLAN_CAP_PAISE: Record<OrgPlan, number> = {
  starter: 0,
  growth: 0, // screening is Business-only; growth never reaches Stage 2
  business: 2000 * 100,
  custom: 2000 * 100,
};

function istMonthStartIso(): string {
  // IST = UTC+5:30. Compute first day of the current IST month, expressed in UTC.
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const start = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1, 0, 0, 0));
  return new Date(start.getTime() - 5.5 * 60 * 60 * 1000).toISOString();
}

export async function monthSpentPaise(orgId: string): Promise<number> {
  const supabase = createAdminSupabase();
  const { data } = await (supabase as any)
    .from("screening_audit_log")
    .select("cost_inr_paise")
    .eq("org_id", orgId)
    .gte("created_at", istMonthStartIso());
  return (data ?? []).reduce((sum: number, r: any) => sum + ((r as any).cost_inr_paise ?? 0), 0);
}

export async function assertScreeningBudget(
  orgId: string,
  plan: OrgPlan,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminSupabase();
  const { data: org } = await supabase.from("organizations").select("settings").eq("id", orgId).single();
  const override = (org as any)?.settings?.screening?.monthly_cap_inr_paise as number | undefined;
  const cap = typeof override === "number" ? override : PLAN_CAP_PAISE[plan];
  if (cap <= 0) return { ok: true }; // 0 = uncapped/never-block
  const spent = await monthSpentPaise(orgId);
  if (spent >= cap)
    return { ok: false, error: "Monthly screening budget reached. Stage-1 ranking still works." };
  return { ok: true };
}
