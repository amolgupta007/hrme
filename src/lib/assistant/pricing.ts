import type { OrgPlan } from "@/config/plans";

// USD per 1M tokens for the gateway model we use. Keep in one place; update when rates change.
const RATE_USD_PER_MTOK = {
  "anthropic/claude-sonnet-4-6": { input: 3, output: 15 },
} as const;

const DEFAULT_MODEL = "anthropic/claude-sonnet-4-6";
const USD_TO_INR = 86;
const INR_PER_PAISA = 100;

export function tokensToInrPaise(args: {
  inputTokens: number;
  outputTokens: number;
  model?: string;
}): number {
  const rate =
    RATE_USD_PER_MTOK[(args.model ?? DEFAULT_MODEL) as keyof typeof RATE_USD_PER_MTOK] ??
    RATE_USD_PER_MTOK[DEFAULT_MODEL];
  const usd =
    (args.inputTokens / 1_000_000) * rate.input +
    (args.outputTokens / 1_000_000) * rate.output;
  return Math.round(usd * USD_TO_INR * INR_PER_PAISA);
}

// Monthly hard cap per plan, in paise. Overridable per-org via assistant_budget.hard_cap_inr_paise.
export const PLAN_BUDGET_PAISE: Record<OrgPlan, number> = {
  starter: 0,
  growth: 500 * 100,
  business: 2000 * 100,
  custom: 2000 * 100,
};

export const STARTER_CREDIT_PAISE = 200 * 100;
