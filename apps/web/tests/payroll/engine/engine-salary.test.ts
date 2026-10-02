import { describe, expect, it } from "vitest";
import {
  computeCTCBreakdown,
} from "@jambahr/shared/payroll/ctc";
import {
  computePayslip,
  JAMBAHR_GLOBAL_RULES,
  legacyComponents,
  legacySettings,
} from "@jambahr/shared/payroll/engine";
import {
  effectiveRevision,
  revisionDraftFromLegacy,
  toEmployeeInput,
  type SalaryRevision,
} from "@/lib/payroll/engine-salary";

const rev = (month: string, gross: number, extra: Partial<SalaryRevision> = {}): SalaryRevision => ({
  id: month, employeeId: "e1", effectiveFromMonth: month, monthlyGross: gross, annualCtc: null,
  taxRegime: "new", declaredDeductionsAnnual: 0, ptState: "maharashtra", notes: null, createdAt: "", overrides: {}, ...extra,
});

describe("salary revisions", () => {
  it("each month uses the revision in force for it; earlier months keep theirs", () => {
    const revisions = [rev("2026-04", 50000), rev("2026-10", 65000), { ...rev("2026-06", 99999), employeeId: "other" }];
    expect(effectiveRevision(revisions, "e1", "2026-03")).toBeNull();
    expect(effectiveRevision(revisions, "e1", "2026-09")?.monthlyGross).toBe(50000);
    expect(effectiveRevision(revisions, "e1", "2026-10")?.monthlyGross).toBe(65000);
    expect(effectiveRevision(revisions, "e1", "2027-02")?.monthlyGross).toBe(65000);
  });

  it("maps a revision and the employee into the engine's input", () => {
    const input = toEmployeeInput(rev("2026-10", 65000, { overrides: { LTA: { amount: 6500 } } }), {
      id: "e1", gender: "female", date_of_joining: "2026-08-27",
    });
    expect(input).toMatchObject({ employeeId: "e1", gender: "female", state: "maharashtra", monthlyGross: 65000, annualCtc: undefined, dateOfJoining: "2026-08-27" });
    expect(input.overrides).toEqual({ LTA: { amount: 6500 } });
  });

  it("a pre-engine salary carries over unchanged: same numbers as computeCTCBreakdown (Aug 2026, before the EPF change)", () => {
    const legacy = { ctc: 1800000, state: "Maharashtra", is_metro: false, include_hra: true, tax_regime: "new" as const, additional_deductions_annual: 0 };
    const draft = revisionDraftFromLegacy(legacy);
    expect(draft.ptState).toBe("maharashtra");
    const slip = computePayslip({
      settings: legacySettings(26), components: legacyComponents(), rules: JAMBAHR_GLOBAL_RULES,
      employee: toEmployeeInput({ ...rev("2026-04", 0), monthlyGross: null, annualCtc: draft.annualCtc, overrides: draft.overrides, ptState: draft.ptState }, { id: "e1", gender: null, date_of_joining: "2020-01-01" }),
      run: { month: "2026-08" },
    });
    const old = computeCTCBreakdown(1800000, "Maharashtra", false, true, "new", 0);
    expect(slip.grossEarnings).toBe(old.grossMonthly);
    expect(slip.lines.find((l) => l.code === "HRA")?.amount).toBe(old.hraMonthly);
    expect(slip.lines.find((l) => l.code === "EPF_EE")?.amount).toBe(old.employeePfMonthly);
  });
});
