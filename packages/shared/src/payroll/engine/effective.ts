// Turning versioned rows (settings, components) into what applies to a month,
// plus the default component set for an org starting on the engine. Pure.
import { isPayMonth } from "./rules";
import type { ComponentDef, InputMode, PayMonth, PayrollSettings } from "./types";

/** The newest version with effectiveFromMonth <= month, or null. */
export function pickEffective<T extends { effectiveFromMonth: PayMonth }>(rows: T[], month: PayMonth): T | null {
  if (!isPayMonth(month)) throw new Error(`Invalid pay month "${month}" (expected YYYY-MM)`);
  let best: T | null = null;
  for (const r of rows) {
    if (r.effectiveFromMonth <= month && (!best || r.effectiveFromMonth > best.effectiveFromMonth)) best = r;
  }
  return best;
}

/** Per component code, the newest version effective for the month. */
export function effectiveComponents<T extends ComponentDef & { effectiveFromMonth: PayMonth }>(
  rows: T[],
  month: PayMonth,
): T[] {
  const byCode = new Map<string, T[]>();
  for (const r of rows) byCode.set(r.code, [...(byCode.get(r.code) ?? []), r]);
  const out: T[] = [];
  for (const versions of byCode.values()) {
    const v = pickEffective(versions, month);
    if (v) out.push(v);
  }
  return out.sort((a, b) => a.order - b.order);
}

/** "2026-10" → "2026-11". */
export function nextMonth(month: PayMonth): PayMonth {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** Current pay month in IST. */
export function currentPayMonthIST(now: Date = new Date()): PayMonth {
  const ist = new Date(now.getTime() + 330 * 60_000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Settings for an org that turns the engine on without changing anything else. */
export function defaultSettings(mode: InputMode): PayrollSettings {
  return mode === "gross_first"
    ? {
        inputMode: "gross_first",
        dayBasis: { type: "calendar_days" },
        lopTreatment: "prorate",
        prorateJoinersLeavers: true,
        lineRounding: "rupee",
        netRounding: "rupee",
      }
    : {
        inputMode: "ctc_first",
        dayBasis: { type: "fixed_days", days: 26 },
        lopTreatment: "deduction",
        prorateJoinersLeavers: false,
        lineRounding: "rupee",
        netRounding: "rupee",
      };
}

/**
 * The starting component set: the October pay slip's lines switched on
 * (Basic, Special allowance; Income tax, PF, Professional tax), everything
 * else present but switched off so it is one tick away. Basic is a % of gross
 * or of CTC depending on how the org enters salaries.
 */
export function defaultComponents(mode: InputMode): ComponentDef[] {
  const on = { prorate: true, taxable: true, enabled: true, showOnPayslip: true };
  const off = { ...on, enabled: false };
  const basicBase = mode === "gross_first" ? "GROSS" : "CTC";
  const basicPct = mode === "gross_first" ? 50 : 40;
  return [
    { ...on, code: "BASIC", label: "Basic", kind: "earning", method: "pct_of", base: basicBase, pct: basicPct, order: 10 },
    { ...off, code: "HRA", label: "HRA", kind: "earning", method: "pct_of", base: "BASIC", pct: 40, order: 20 },
    { ...off, code: "CONV", label: "Conveyance allowance", kind: "earning", method: "fixed", amount: 0, order: 30 },
    { ...off, code: "LTA", label: "Leave travel allowance", kind: "earning", method: "fixed", amount: 0, order: 40 },
    { ...on, code: "SPECIAL", label: "Special allowance", kind: "earning", method: "balancing", order: 90 },
    { ...on, code: "TDS", label: "Income tax", kind: "deduction", method: "statutory", rule: "tds", order: 100 },
    { ...on, code: "EPF_EE", label: "Provident fund", kind: "deduction", method: "statutory", rule: "epf", order: 110 },
    { ...off, code: "ESI_EE", label: "ESI", kind: "deduction", method: "statutory", rule: "esi", order: 115 },
    { ...off, code: "LWF_EE", label: "Labour welfare fund", kind: "deduction", method: "statutory", rule: "lwf", order: 118 },
    { ...on, code: "PT", label: "Professional tax", kind: "deduction", method: "statutory", rule: "pt", order: 120 },
    { ...on, code: "EPF_ER", label: "Employer PF", kind: "employer_contribution", method: "statutory", rule: "epf", order: 210, showOnPayslip: false },
    { ...off, code: "ESI_ER", label: "Employer ESI", kind: "employer_contribution", method: "statutory", rule: "esi", order: 215, showOnPayslip: false },
    { ...off, code: "LWF_ER", label: "Employer labour welfare fund", kind: "employer_contribution", method: "statutory", rule: "lwf", order: 218, showOnPayslip: false },
    { ...off, code: "GRATUITY", label: "Gratuity", kind: "employer_contribution", method: "pct_of", base: "BASIC", pct: 4.81, order: 220, showOnPayslip: false },
  ];
}

/** Codes that are part of the system set: they can be switched off and renamed, never deleted. */
export const SYSTEM_COMPONENT_CODES = new Set(defaultComponents("ctc_first").map((c) => c.code));

/**
 * Structural problems that would make a run fail, found before saving.
 * Returns human-readable messages; empty = OK.
 */
export function validateComponents(components: ComponentDef[], mode: InputMode): string[] {
  const errors: string[] = [];
  const enabled = components.filter((c) => c.enabled);
  const codes = new Set(enabled.map((c) => c.code));
  const seen = new Set<string>();
  for (const c of components) {
    if (seen.has(c.code)) errors.push(`${c.code} appears twice`);
    seen.add(c.code);
  }
  const balancing = enabled.filter((c) => c.method === "balancing");
  if (balancing.length > 1) errors.push("Only one component can take the balance");
  for (const c of enabled) {
    if (c.method === "pct_of") {
      if (!c.base) errors.push(`${c.label}: choose what the percentage is of`);
      else if (c.base === "GROSS" && mode === "ctc_first") errors.push(`${c.label}: with salaries entered as CTC, use a % of CTC or of another component`);
      else if (c.base === "CTC" && mode === "gross_first") errors.push(`${c.label}: with salaries entered as monthly gross, use a % of gross or of another component`);
      else if (c.base !== "GROSS" && c.base !== "CTC" && !codes.has(c.base)) errors.push(`${c.label}: "${c.base}" is not a switched-on component`);
      else if (c.base === c.code) errors.push(`${c.label} cannot be a percentage of itself`);
      if ((c.pct ?? -1) < 0 || (c.pct ?? 0) > 100) errors.push(`${c.label}: percentage must be between 0 and 100`);
    }
    if (c.method === "fixed" && (c.amount ?? 0) < 0) errors.push(`${c.label}: amount can't be negative`);
    if (c.method === "statutory" && !c.rule) errors.push(`${c.label}: statutory components need a rule`);
    if (c.kind === "earning" && c.method === "statutory") errors.push(`${c.label}: an earning can't be statutory`);
    if (c.method === "balancing" && c.kind !== "earning") errors.push(`${c.label}: only an earning can take the balance`);
    if ((c.rule === "pt" || c.rule === "tds") && c.kind !== "deduction") errors.push(`${c.label}: must be a deduction`);
  }
  // Cycles among earnings' % bases.
  const pctOf = new Map(enabled.filter((c) => c.method === "pct_of").map((c) => [c.code, c.base!]));
  for (const start of pctOf.keys()) {
    let cur: string | undefined = start;
    const path = new Set<string>();
    while (cur && pctOf.has(cur)) {
      if (path.has(cur)) { errors.push(`Components refer to each other in a loop (${[...path].join(" → ")})`); break; }
      path.add(cur);
      cur = pctOf.get(cur);
    }
  }
  if (!enabled.some((c) => c.kind === "earning")) errors.push("Switch on at least one earning");
  return [...new Set(errors)];
}
