// Plain module — NOT "use server" (gotcha #85): raw org/employee ids; the
// caller (getMyEngineCompensation) resolves who is asking.
//
// "My Compensation" for orgs on the payroll engine: the employee's salary in
// effect this pay month, computed by the same engine as their pay slip, as a
// full month (no proration, LOP or one-off adjustments). Lines follow the pay
// slip's rules: only components shown on the slip, zero lines dropped, and
// employer contributions + CTC only when the org shows them on the slip.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computePayslip,
  projectAnnualCtc,
  type ComponentDef,
  type EmployeePayInput,
  type PayMonth,
  type PayrollSettings,
  type PayslipLine,
  type StatutoryRule,
} from "@jambahr/shared/payroll/engine";
import { loadPayrollConfig } from "./engine-config";
import { effectiveRevision, loadRevisions, toEmployeeInput } from "./engine-salary";

export interface CompensationLine {
  label: string;
  amount: number;
}

export interface EngineCompensation {
  /** The pay month the figures are for. */
  month: PayMonth;
  /** When the salary in effect started. */
  effectiveFromMonth: PayMonth;
  earnings: CompensationLine[];
  deductions: CompensationLine[];
  grossMonthly: number;
  deductionsMonthly: number;
  netMonthly: number;
  /** Null unless the org shows employer contributions on pay slips. */
  employerContributions: CompensationLine[] | null;
  ctcMonthly: number | null;
  ctcAnnual: number | null;
}

const nonZero = (l: PayslipLine) => Math.round(l.amount * 100) !== 0;
const toLines = (lines: PayslipLine[]) =>
  lines.sort((a, b) => a.order - b.order).map((l) => ({ label: l.label, amount: l.amount }));

export function buildEngineCompensation(input: {
  settings: PayrollSettings;
  components: ComponentDef[];
  rules: StatutoryRule[];
  employee: EmployeePayInput;
  month: PayMonth;
  effectiveFromMonth: PayMonth;
  showEmployerContributions: boolean;
}): EngineCompensation {
  const { settings, components, rules, month, showEmployerContributions } = input;
  const employee = { ...input.employee, dateOfJoining: null, dateOfLeaving: null };
  const slip = computePayslip({ settings, components, rules, employee, run: { month } });
  const shown = (kind: PayslipLine["kind"]) => slip.lines.filter((l) => l.kind === kind && l.showOnPayslip && nonZero(l));

  return {
    month,
    effectiveFromMonth: input.effectiveFromMonth,
    earnings: toLines(shown("earning")),
    deductions: toLines(shown("deduction")),
    grossMonthly: slip.grossEarnings,
    deductionsMonthly: slip.totalDeductions,
    netMonthly: slip.netPay,
    employerContributions: showEmployerContributions
      ? toLines(slip.lines.filter((l) => l.kind === "employer_contribution" && nonZero(l)))
      : null,
    ctcMonthly: showEmployerContributions ? slip.ctcMonthly : null,
    ctcAnnual: showEmployerContributions
      ? Math.round(employee.annualCtc ?? projectAnnualCtc({ settings, components, rules, employee, month }))
      : null,
  };
}

/** The employee's compensation this month, or null when they have no salary revision in effect. */
export async function loadEngineCompensation(
  sb: SupabaseClient,
  orgId: string,
  employeeId: string,
  month: PayMonth,
): Promise<EngineCompensation | null> {
  const [config, revisions, personRes, orgRes] = await Promise.all([
    loadPayrollConfig(sb, orgId, month),
    loadRevisions(sb, orgId, employeeId),
    sb.from("employees").select("id, gender, date_of_joining").eq("org_id", orgId).eq("id", employeeId).single(),
    sb.from("organizations").select("settings").eq("id", orgId).single(),
  ]);
  if (personRes.error) throw new Error(`employees: ${personRes.error.message}`);
  if (orgRes.error) throw new Error(`organizations: ${orgRes.error.message}`);
  const rev = effectiveRevision(revisions, employeeId, month);
  if (!rev) return null;
  const payslip = ((orgRes.data as { settings: Record<string, any> | null }).settings ?? {}).payslip ?? {};
  return buildEngineCompensation({
    settings: config.settings,
    components: config.components,
    rules: config.rules,
    employee: toEmployeeInput(rev, personRes.data as { id: string; gender: string | null; date_of_joining: string | null }),
    month,
    effectiveFromMonth: rev.effectiveFromMonth,
    showEmployerContributions: !!payslip.showEmployerContributions,
  });
}
