// Statutory rule selection + param validation. Pure.
import { z } from "zod";
import type { PayMonth, RuleParams, StatutoryRule, StatutoryRuleKey } from "./types";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isPayMonth(v: string): boolean {
  return MONTH_RE.test(v);
}

/**
 * Picks the rule that governs `month`, by PAY PERIOD — never by the date the
 * run is processed. An org override beats the JambaHR global default; within a
 * scope, the newest version with effectiveFromMonth <= month wins. For PT/LWF
 * a rule for the employee's state beats a state-less (default) rule.
 */
export function resolveRule<K extends StatutoryRuleKey>(
  rules: StatutoryRule[],
  ruleKey: K,
  month: PayMonth,
  jurisdiction: string | null = null,
): StatutoryRule<K> | null {
  if (!isPayMonth(month)) throw new Error(`Invalid pay month "${month}" (expected YYYY-MM)`);
  const j = jurisdiction?.trim().toLowerCase() || null;

  const candidates = rules.filter(
    (r) =>
      r.ruleKey === ruleKey &&
      r.effectiveFromMonth <= month &&
      (r.jurisdiction === null || (j !== null && r.jurisdiction.toLowerCase() === j)),
  );

  const rank = (r: StatutoryRule) =>
    (r.scope === "org" ? 2 : 0) + (r.jurisdiction !== null ? 1 : 0);

  candidates.sort((a, b) => {
    const byRank = rank(b) - rank(a);
    if (byRank !== 0) return byRank;
    return b.effectiveFromMonth.localeCompare(a.effectiveFromMonth);
  });

  return (candidates[0] as StatutoryRule<K> | undefined) ?? null;
}

// ── Param schemas (used when an admin edits a rule) ────────────────────────

const pct = z.number().min(0).max(100);
const money = z.number().min(0);
const codes = z.array(z.string().min(1)).min(1);

const taxRegimeSchema = z.object({
  slabs: z
    .array(z.object({ upTo: money.nullable(), rate: pct }))
    .min(1)
    .refine((s) => s[s.length - 1].upTo === null, "The last slab must have no upper bound"),
  standardDeduction: money,
  rebateUpTo: money,
  allowsDeclaredDeductions: z.boolean(),
});

export const RULE_PARAM_SCHEMAS: { [K in StatutoryRuleKey]: z.ZodType<RuleParams[K]> } = {
  epf: z.object({
    eeRate: pct,
    erRate: pct,
    wageBase: codes,
    wageCeiling: money.nullable(),
    contributeAboveCeiling: z.boolean(),
  }),
  esi: z.object({
    eeRate: pct,
    erRate: pct,
    wageBase: codes,
    eligibility: z.object({
      measure: z.enum(["fixed_gross", "earned_gross", "wage_base"]),
      max: money,
    }),
  }),
  pt: z.object({
    measure: z.enum(["earned_gross", "fixed_gross"]),
    slabs: z
      .array(z.object({ below: money.nullable(), amount: money }))
      .min(1)
      .refine((s) => s[s.length - 1].below === null, "The last slab must have no upper bound"),
    exemptions: z.array(z.object({ gender: z.string().min(1), below: money })).optional(),
    monthOverrides: z
      .array(
        z.object({ month: z.string().regex(/^(0[1-9]|1[0-2])$/), fromAmount: money, toAmount: money }),
      )
      .optional(),
  }),
  lwf: z.object({
    eeAmount: money,
    erAmount: money,
    months: z.array(z.string().regex(/^(0[1-9]|1[0-2])$/)),
  }),
  tds: z.object({
    cessPct: pct,
    regimes: z.object({ new: taxRegimeSchema, old: taxRegimeSchema }),
  }),
};
