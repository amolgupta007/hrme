// The payroll engine. The ONLY place salary maths happens; every surface
// (run processing, previews, pay slips, CTC display) goes through here. Pure.
import { computeMonthsInFY } from "../ctc";
import { resolveRule, isPayMonth } from "./rules";
import { computeEpf, computeEsi, computeLwf, computePt, computeTds } from "./statutory";
import {
  BASE_CTC,
  BASE_GROSS,
  type ComponentDef,
  type EmployeePayInput,
  type PayMonth,
  type PayrollSettings,
  type PayslipLine,
  type PayslipResult,
  type RunInput,
  type StatutoryRule,
  type StatutoryRuleKey,
  type TdsProjection,
} from "./types";

export interface ComputeInput {
  settings: PayrollSettings;
  components: ComponentDef[];
  rules: StatutoryRule[];
  employee: EmployeePayInput;
  run: RunInput;
}

const round = (n: number) => Math.round(n);

// ── Days ────────────────────────────────────────────────────────────────────

export function daysInMonth(month: PayMonth): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Calendar days of `month` on which the employee was employed (DOJ..DOL inclusive). */
export function employedCalendarDays(month: PayMonth, doj?: string | null, dol?: string | null): number {
  const [y, m] = month.split("-").map(Number);
  const total = daysInMonth(month);
  const day = (iso: string) => {
    const [yy, mm, dd] = iso.slice(0, 10).split("-").map(Number);
    return Date.UTC(yy, mm - 1, dd);
  };
  const first = Date.UTC(y, m - 1, 1);
  const last = Date.UTC(y, m - 1, total);
  const start = doj ? Math.max(first, day(doj)) : first;
  const end = dol ? Math.min(last, day(dol)) : last;
  if (end < start) return 0;
  return Math.round((end - start) / 86_400_000) + 1;
}

// ── CTC-first: annual structure → monthly amounts ───────────────────────────

/**
 * Splits an annual CTC into monthly earning amounts. Earnings are resolved on
 * annual figures (each rounded), employer contributions are taken out, the
 * balancing component takes the remainder, then each is divided by 12 and
 * rounded. This mirrors JambaHR's legacy computeCTCBreakdown.
 */
export function resolveCtcStructure(input: Omit<ComputeInput, "run"> & { month: PayMonth }): Record<string, number> {
  const { components, rules, employee, settings, month } = input;
  const ctc = employee.annualCtc;
  if (ctc === undefined || ctc === null) throw new Error("ctc_first mode needs employee.annualCtc");
  const enabled = components.filter((c) => c.enabled);
  const earnings = enabled.filter((c) => c.kind === "earning").sort((a, b) => a.order - b.order);
  const employerComps = enabled.filter((c) => c.kind === "employer_contribution");
  const monthMM = month.slice(5, 7);

  const annual: Record<string, number> = {};
  const valueOf = (code: string): number => {
    if (code === BASE_CTC) return ctc;
    if (code === BASE_GROSS) throw new Error("In ctc_first mode, percentages must be of CTC or of a component, not GROSS");
    if (!(code in annual)) throw new Error(`Component base "${code}" is not resolved yet (check order)`);
    return annual[code];
  };

  for (const c of earnings) {
    if (c.method === "balancing" || c.method === "statutory") continue;
    const ov = employee.overrides?.[c.code];
    if (c.method === "fixed") annual[c.code] = (ov?.amount ?? c.amount ?? 0) * 12;
    else if (c.method === "pct_of") annual[c.code] = round((valueOf(c.base!) * (ov?.pct ?? c.pct ?? 0)) / 100);
    else annual[c.code] = 0; // manual earnings are per-run, not part of the structure
  }

  const balancing = earnings.find((c) => c.method === "balancing");

  // Employer contributions can depend on gross (ESI eligibility), which depends
  // on the balancing figure — iterate to a fixed point (2 passes in practice).
  let employerAnnual = 0;
  for (let pass = 0; pass < 5; pass++) {
    if (balancing) {
      const others = Object.entries(annual)
        .filter(([k]) => k !== balancing.code)
        .reduce((s, [, v]) => s + v, 0);
      annual[balancing.code] = Math.max(0, ctc - others - employerAnnual);
    }
    const monthly = (code: string) => (annual[code] ?? 0) / 12;
    const grossMonthly = earnings.reduce((s, c) => s + monthly(c.code), 0);

    let next = 0;
    for (const c of employerComps) {
      if (c.method === "fixed") next += (employee.overrides?.[c.code]?.amount ?? c.amount ?? 0) * 12;
      else if (c.method === "pct_of") next += round((valueOf(c.base!) * (employee.overrides?.[c.code]?.pct ?? c.pct ?? 0)) / 100);
      else if (c.method === "statutory" && c.rule) {
        const m = employerMonthly(c.rule, {
          rules, month, monthMM, employee, settings, grossFixed: grossMonthly, grossEarned: grossMonthly, valueOf: monthly,
        });
        next += (settings.lineRounding === "rupee" ? round(m.amount) : m.amount) * (c.rule === "lwf" ? 1 : 12);
      }
    }
    if (next === employerAnnual) break;
    employerAnnual = next;
  }

  const out: Record<string, number> = {};
  for (const c of earnings) out[c.code] = round((annual[c.code] ?? 0) / 12);
  return out;
}

/** Employer-side statutory amount for a month (LWF returns its ANNUAL total). */
function employerMonthly(
  rule: StatutoryRuleKey,
  ctx: {
    rules: StatutoryRule[]; month: PayMonth; monthMM: string; employee: EmployeePayInput;
    settings: PayrollSettings; grossFixed: number; grossEarned: number; valueOf: (code: string) => number;
  },
): { amount: number } {
  const sum = (codes: string[]) => codes.reduce((s, c) => s + ctx.valueOf(c), 0);
  if (rule === "epf") {
    const r = resolveRule(ctx.rules, "epf", ctx.month);
    return { amount: r ? computeEpf(sum(r.params.wageBase), r.params).employer : 0 };
  }
  if (rule === "esi") {
    const r = resolveRule(ctx.rules, "esi", ctx.month);
    if (!r) return { amount: 0 };
    const wage = sum(r.params.wageBase);
    return {
      amount: computeEsi(wage, { fixed_gross: ctx.grossFixed, earned_gross: ctx.grossEarned, wage_base: wage }, r.params).employer,
    };
  }
  if (rule === "lwf") {
    const r = resolveRule(ctx.rules, "lwf", ctx.month, ctx.employee.state ?? null);
    return { amount: r ? r.params.erAmount * r.params.months.length : 0 };
  }
  return { amount: 0 };
}

// ── The month ──────────────────────────────────────────────────────────────

export function computePayslip(input: ComputeInput): PayslipResult {
  const { settings, rules, employee, run } = input;
  const month = run.month;
  if (!isPayMonth(month)) throw new Error(`Invalid pay month "${month}" (expected YYYY-MM)`);
  const monthMM = month.slice(5, 7);
  const warnings: string[] = [];
  const rnd = (n: number) => (settings.lineRounding === "rupee" ? round(n) : n);

  const components = input.components.filter((c) => c.enabled).sort((a, b) => a.order - b.order);
  const byCode = new Map(components.map((c) => [c.code, c]));

  // Days and proration.
  const calendarDays = daysInMonth(month);
  const basisDays = settings.dayBasis.type === "calendar_days" ? calendarDays : settings.dayBasis.days;
  const employedCal = settings.prorateJoinersLeavers
    ? employedCalendarDays(month, employee.dateOfJoining, employee.dateOfLeaving)
    : calendarDays;
  const employedBasis = (basisDays * employedCal) / calendarDays;
  const lopDays = Math.max(0, run.lopDays ?? 0);
  const daysPaid = Math.max(0, settings.lopTreatment === "prorate" ? employedBasis - lopDays : employedBasis);
  const factor = basisDays > 0 ? daysPaid / basisDays : 0;

  // Fixed monthly amounts.
  let structure: Record<string, number> | null = null;
  let fixedGross: number;
  if (settings.inputMode === "ctc_first") {
    structure = resolveCtcStructure({ ...input, month });
    fixedGross = Object.values(structure).reduce((s, v) => s + v, 0);
  } else {
    if (employee.monthlyGross === undefined || employee.monthlyGross === null) {
      throw new Error("gross_first mode needs employee.monthlyGross");
    }
    fixedGross = employee.monthlyGross;
  }

  const lines: PayslipLine[] = [];
  const amounts: Record<string, number> = {};
  const push = (c: ComponentDef, amount: number, extra: Partial<PayslipLine> = {}) => {
    amounts[c.code] = amount;
    lines.push({
      code: c.code, label: c.label, kind: c.kind, amount, source: "component",
      showOnPayslip: c.showOnPayslip, order: c.order, ...extra,
    });
  };
  const scale = (c: ComponentDef, v: number) => (c.prorate ? v * factor : v);

  // 1. Earnings (balancing last; pct_of may reference earlier earnings or GROSS).
  const earnings = components.filter((c) => c.kind === "earning");
  const pending = earnings.filter((c) => c.method !== "balancing");
  for (let guard = 0; pending.length > 0; guard++) {
    if (guard > earnings.length + 1) {
      throw new Error(`Circular or missing component base among: ${pending.map((c) => c.code).join(", ")}`);
    }
    for (let i = 0; i < pending.length; i++) {
      const c = pending[i];
      const ov = employee.overrides?.[c.code];
      let amount: number | null = null;
      if (structure) {
        amount = scale(c, structure[c.code] ?? 0);
      } else if (c.method === "fixed") {
        amount = scale(c, ov?.amount ?? c.amount ?? 0);
      } else if (c.method === "manual") {
        amount = run.manual?.[c.code] ?? 0;
      } else if (c.method === "pct_of") {
        const pctV = ov?.pct ?? c.pct ?? 0;
        if (c.base === BASE_GROSS) amount = scale(c, fixedGross) * (pctV / 100);
        else if (c.base && c.base in amounts) amount = amounts[c.base] * (pctV / 100);
        else if (c.base && !byCode.has(c.base)) throw new Error(`Component ${c.code} is a % of unknown "${c.base}"`);
      } else if (c.method === "statutory") {
        throw new Error(`Earning ${c.code} cannot be statutory`);
      }
      if (amount !== null) {
        push(c, rnd(amount), c.method === "pct_of" ? { rate: ov?.pct ?? c.pct } : {});
        pending.splice(i, 1);
        i--;
      }
    }
  }
  for (const c of earnings.filter((e) => e.method === "balancing")) {
    if (structure) {
      push(c, rnd(scale(c, structure[c.code] ?? 0)));
    } else {
      const others = earnings.filter((e) => e.code !== c.code).reduce((s, e) => s + (amounts[e.code] ?? 0), 0);
      // Balancing always lands on a whole rupee (the sheets use ROUND(…, 0)).
      push(c, Math.max(0, round(scale(c, fixedGross) - others)));
    }
  }
  const componentGross = earnings.reduce((s, c) => s + (amounts[c.code] ?? 0), 0);
  const valueOf = (code: string) => (code === BASE_GROSS ? componentGross : amounts[code] ?? 0);

  // 2. Statutory + other deductions / employer contributions (TDS last).
  const ruleVersions: PayslipResult["ruleVersions"] = {};
  const note = <K extends StatutoryRuleKey>(key: K, r: StatutoryRule<K> | null): StatutoryRule<K> | null => {
    if (r) ruleVersions[key] = { id: r.id, effectiveFromMonth: r.effectiveFromMonth };
    else warnings.push(`No ${key.toUpperCase()} rule applies to ${month}; charged 0`);
    return r;
  };
  const sum = (codes: string[]) => codes.reduce((s, c) => s + valueOf(c), 0);
  const others = components.filter((c) => c.kind !== "earning");
  let tdsComponent: ComponentDef | null = null;

  for (const c of others) {
    const isEmployer = c.kind === "employer_contribution";
    const ov = employee.overrides?.[c.code];
    if (c.method === "fixed") { push(c, rnd(scale(c, ov?.amount ?? c.amount ?? 0))); continue; }
    if (c.method === "manual") { push(c, run.manual?.[c.code] ?? 0); continue; }
    if (c.method === "pct_of") { push(c, rnd(valueOf(c.base!) * ((ov?.pct ?? c.pct ?? 0) / 100)), { rate: ov?.pct ?? c.pct }); continue; }
    if (c.method === "balancing") throw new Error(`Only earnings can be balancing (${c.code})`);

    switch (c.rule) {
      case "tds":
        if (isEmployer) throw new Error("TDS cannot be an employer contribution");
        tdsComponent = c;
        break;
      case "epf": {
        const r = note("epf", resolveRule(rules, "epf", month));
        if (!r) { push(c, 0); break; }
        const e = computeEpf(sum(r.params.wageBase), r.params);
        push(c, rnd(isEmployer ? e.employer : e.employee), {
          base: e.contributoryWage, rate: isEmployer ? r.params.erRate : r.params.eeRate, ruleId: r.id,
        });
        break;
      }
      case "esi": {
        const r = note("esi", resolveRule(rules, "esi", month));
        if (!r) { push(c, 0); break; }
        const wage = sum(r.params.wageBase);
        const e = computeEsi(wage, { fixed_gross: fixedGross, earned_gross: componentGross, wage_base: wage }, r.params);
        push(c, rnd(isEmployer ? e.employer : e.employee), {
          base: wage, rate: isEmployer ? r.params.erRate : r.params.eeRate, ruleId: r.id,
          note: e.covered ? undefined : "not covered",
        });
        break;
      }
      case "pt": {
        if (isEmployer) throw new Error("PT cannot be an employer contribution");
        const r = note("pt", resolveRule(rules, "pt", month, employee.state ?? null));
        if (!r) { push(c, 0); break; }
        const measure = r.params.measure === "fixed_gross" ? fixedGross : componentGross;
        push(c, computePt(measure, r.params, employee.gender ?? null, monthMM), { base: measure, ruleId: r.id });
        break;
      }
      case "lwf": {
        const r = note("lwf", resolveRule(rules, "lwf", month, employee.state ?? null));
        if (!r) { push(c, 0); break; }
        const e = computeLwf(r.params, monthMM);
        push(c, isEmployer ? e.employer : e.employee, { ruleId: r.id });
        break;
      }
      default:
        throw new Error(`Statutory component ${c.code} has no rule`);
    }
  }

  // 3. Loss of pay / late penalty as their own lines, at fixed gross ÷ basis days.
  const perDay = basisDays > 0 ? fixedGross / basisDays : 0;
  if (settings.lopTreatment === "deduction" && lopDays > 0) {
    lines.push({
      code: "LOP", label: "Loss of pay", kind: "deduction", amount: round(perDay * lopDays),
      source: "lop", showOnPayslip: true, order: 9000,
    });
  }
  const lateDays = Math.max(0, run.latePenaltyDays ?? 0);
  if (lateDays > 0) {
    lines.push({
      code: "LATE_PENALTY", label: "Late-arrival penalty", kind: "deduction", amount: round(perDay * lateDays),
      source: "late_penalty", showOnPayslip: true, order: 9001,
    });
  }

  // 4. One-off adjustments.
  let taxableAdjustments = 0;
  for (const [i, a] of (run.adjustments ?? []).entries()) {
    if (a.amount < 0) throw new Error("Adjustment amounts are positive; use direction for deductions");
    if (a.direction === "earning" && a.taxable !== false) taxableAdjustments += a.amount;
    lines.push({
      code: a.code ?? `ADJ_${i + 1}`, label: a.label, kind: a.direction, amount: a.amount,
      source: "adjustment", showOnPayslip: true, order: 8000 + i,
    });
  }

  // 5. TDS, on the projection over the months worked in this FY.
  let tds: TdsProjection | undefined;
  if (tdsComponent) {
    const r = note("tds", resolveRule(rules, "tds", month));
    if (r) {
      const regime = employee.taxRegime ?? "new";
      const monthsInFY = computeMonthsInFY(month, employee.dateOfJoining ?? null);
      const monthlyTaxable = earnings.filter((c) => c.taxable).reduce((s, c) => s + (amounts[c.code] ?? 0), 0);
      const pfCode = components.find((c) => c.kind === "deduction" && c.rule === "epf")?.code;
      const t = computeTds({
        monthlyTaxable,
        monthlyEmployeePf: pfCode ? amounts[pfCode] ?? 0 : 0,
        monthsInFY,
        regime,
        declaredDeductionsAnnual: employee.declaredDeductionsAnnual ?? 0,
        taxableAdjustments,
        p: r.params,
      });
      tds = { regime, monthsInFY, ...t };
      push(tdsComponent, t.monthlyTds + t.adjustmentTax, { ruleId: r.id });
    } else {
      push(tdsComponent, 0);
    }
  }

  // 6. Totals.
  const total = (kind: PayslipLine["kind"]) => lines.filter((l) => l.kind === kind).reduce((s, l) => s + l.amount, 0);
  const grossEarnings = total("earning");
  const totalDeductions = total("deduction");
  const employerContributions = total("employer_contribution");
  const rawNet = Math.max(0, grossEarnings - totalDeductions);
  const netPay = settings.netRounding === "rupee" ? round(rawNet) : rawNet;

  lines.sort((a, b) => a.order - b.order);
  return {
    month, basisDays, daysPaid, prorationFactor: factor, lines,
    grossEarnings, totalDeductions, employerContributions, netPay,
    ctcMonthly: componentGross + employerContributions,
    ruleVersions, tds, warnings,
  };
}

/**
 * Annual CTC for a full financial year (April–March) containing `month`, with
 * each month computed under that month's rules — so a mid-year rule change
 * (e.g. EPF ceiling from September) and half-yearly LWF are counted correctly.
 * Assumes full attendance; joining/leaving dates are ignored.
 */
export function projectAnnualCtc(input: Omit<ComputeInput, "run"> & { month: PayMonth }): number {
  const [y, m] = input.month.split("-").map(Number);
  const fyStart = m >= 4 ? y : y - 1;
  const employee = { ...input.employee, dateOfJoining: null, dateOfLeaving: null };
  let total = 0;
  for (let i = 0; i < 12; i++) {
    const mm = ((3 + i) % 12) + 1;
    const yy = mm >= 4 ? fyStart : fyStart + 1;
    const month = `${yy}-${String(mm).padStart(2, "0")}`;
    total += computePayslip({ ...input, employee, run: { month } }).ctcMonthly;
  }
  return total;
}
