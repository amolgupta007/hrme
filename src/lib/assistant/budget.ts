import { createAdminSupabase } from "@/lib/supabase/server";
import { tokensToInrPaise, PLAN_BUDGET_PAISE } from "./pricing";
import type { OrgPlan } from "@/config/plans";

function istMonth(d = new Date()): string {
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}`;
}

export type BudgetVerdict =
  | { allowed: true; usedPaise: number; capPaise: number }
  | { allowed: false; reason: "budget-exceeded"; usedPaise: number; capPaise: number };

export async function checkBudget(orgId: string, plan: OrgPlan): Promise<BudgetVerdict> {
  const supabase = createAdminSupabase();
  const month = istMonth();
  const { data } = await supabase
    .from("assistant_budget")
    .select("cost_inr_paise, hard_cap_inr_paise, hard_paused_at")
    .eq("org_id", orgId)
    .eq("month", month)
    .maybeSingle();

  const used = (data as { cost_inr_paise?: number } | null)?.cost_inr_paise ?? 0;
  const cap =
    (data as { hard_cap_inr_paise?: number | null } | null)?.hard_cap_inr_paise ??
    PLAN_BUDGET_PAISE[plan] ??
    0;
  if (cap > 0 && used >= cap) {
    return { allowed: false, reason: "budget-exceeded", usedPaise: used, capPaise: cap };
  }
  return { allowed: true, usedPaise: used, capPaise: cap };
}

export async function recordUsage(args: {
  orgId: string;
  plan: OrgPlan;
  inputTokens: number;
  outputTokens: number;
  model?: string;
}): Promise<{ usedPaise: number; capPaise: number; crossedSoftCap: boolean; crossedHardCap: boolean }> {
  const supabase = createAdminSupabase();
  const month = istMonth();
  const delta = tokensToInrPaise(args);

  const { data: existing } = await supabase
    .from("assistant_budget")
    .select("cost_inr_paise, input_tokens, output_tokens, hard_cap_inr_paise, soft_alert_sent_at, hard_paused_at")
    .eq("org_id", args.orgId)
    .eq("month", month)
    .maybeSingle();

  const e = (existing ?? null) as {
    cost_inr_paise?: number;
    input_tokens?: number;
    output_tokens?: number;
    hard_cap_inr_paise?: number | null;
    soft_alert_sent_at?: string | null;
    hard_paused_at?: string | null;
  } | null;

  const prevUsed = e?.cost_inr_paise ?? 0;
  const newUsed = prevUsed + delta;
  const cap = e?.hard_cap_inr_paise ?? PLAN_BUDGET_PAISE[args.plan] ?? 0;
  const softThreshold = Math.floor(cap * 0.8);

  const crossedSoftCap =
    cap > 0 && prevUsed < softThreshold && newUsed >= softThreshold && !e?.soft_alert_sent_at;
  const crossedHardCap = cap > 0 && prevUsed < cap && newUsed >= cap && !e?.hard_paused_at;

  const nowIso = new Date().toISOString();
  await supabase.from("assistant_budget").upsert(
    {
      org_id: args.orgId,
      month,
      input_tokens: (e?.input_tokens ?? 0) + args.inputTokens,
      output_tokens: (e?.output_tokens ?? 0) + args.outputTokens,
      cost_inr_paise: newUsed,
      updated_at: nowIso,
      ...(crossedSoftCap ? { soft_alert_sent_at: nowIso } : {}),
      ...(crossedHardCap ? { hard_paused_at: nowIso } : {}),
    },
    { onConflict: "org_id,month" }
  );

  return { usedPaise: newUsed, capPaise: cap, crossedSoftCap, crossedHardCap };
}
