import { describe, expect, it } from "vitest";
import { computePayslip } from "@jambahr/shared/payroll/engine";
import {
  amountInWordsINR,
  buildPayslipFromLegacy,
  buildPayslipFromSnapshot,
  formatPayslipAmount,
  type EntrySnapshot,
} from "@jambahr/shared/payroll/payslip";
import { NEW_EPF_SHEET } from "./medialoop-sheets.fixture";
import { MEDIALOOP_RULES, MEDIALOOP_SETTINGS, NEW_SHEET_COMPONENTS, employeeFromRow } from "./medialoop-config";

describe("amount in words (Indian numbering)", () => {
  it.each([
    [127506, "RUPEES ONE LAKH TWENTY SEVEN THOUSAND FIVE HUNDRED SIX ONLY"],
    [27888, "RUPEES TWENTY SEVEN THOUSAND EIGHT HUNDRED EIGHTY EIGHT ONLY"],
    [1000000, "RUPEES TEN LAKH ONLY"],
    [12345678, "RUPEES ONE CRORE TWENTY THREE LAKH FORTY FIVE THOUSAND SIX HUNDRED SEVENTY EIGHT ONLY"],
    [100, "RUPEES ONE HUNDRED ONLY"],
    [0, "RUPEES ZERO ONLY"],
    [32568.75, "RUPEES THIRTY TWO THOUSAND FIVE HUNDRED SIXTY EIGHT AND SEVENTY FIVE PAISE ONLY"],
  ])("%s", (n, words) => expect(amountInWordsINR(n)).toBe(words));

  it("formats amounts with Indian grouping and two decimals", () => {
    expect(formatPayslipAmount(127506)).toBe("1,27,506.00");
  });
});

function snapshotFor(code: string, month = "2026-10"): EntrySnapshot {
  const row = NEW_EPF_SHEET.rows.find((r) => r.code === code)!;
  const r = computePayslip({ settings: MEDIALOOP_SETTINGS, components: NEW_SHEET_COMPONENTS, rules: MEDIALOOP_RULES, employee: employeeFromRow(row), run: { month } });
  return {
    month,
    employee: { name: "Sample Person", designation: "Visualiser", uan: "100000000001", bankLast4: "4321" },
    days: { basis: r.basisDays, paid: r.daysPaid, lop: 0, latePenalty: 0 },
    lines: r.lines,
    totals: { gross: r.grossEarnings, deductions: r.totalDeductions, employer: r.employerContributions, net: r.netPay, ctcMonthly: r.ctcMonthly },
  };
}

const ORG = {
  name: "Medialoop Communications ",
  legalName: "MEDIALOOP COMMUNICATION PVT. LTD.",
  address: { lines: ["Plot No. 39, Sinhagad Road", "Pune, Maharashtra 411051"] },
  website: "www.medialoop.in",
  email: "finance@medialoop.in",
  gstin: "27ABCDE1234F1Z5",
};

describe("pay slip from a processed entry (October format)", () => {
  const doc = buildPayslipFromSnapshot(snapshotFor("003"), ORG, { queryLine: "Questions? finance@medialoop.in" }, { paidAt: "2026-11-01T05:00:00Z" });

  it("header carries the legal name, address, contact line and GSTIN", () => {
    expect(doc.org.name).toBe("MEDIALOOP COMMUNICATION PVT. LTD.");
    expect(doc.org.addressLines).toHaveLength(2);
    expect(doc.org.contactLine).toBe("www.medialoop.in | finance@medialoop.in");
    expect(doc.org.ids).toEqual([{ label: "GSTIN", value: "27ABCDE1234F1Z5" }]);
    expect(doc.title).toBe("PAYSLIP FOR THE MONTH OF OCTOBER 2026");
  });

  it("lists only lines shown on the slip with a non-zero amount, in order", () => {
    expect(doc.earnings.map((e) => e.label)).toEqual(["Basic + DA", "HRA", "Conveyance allowance", "Leave travel allowance"]);
    expect(doc.deductions.map((d) => d.label)).toEqual(["Provident fund", "Professional tax"]); // ESI not covered at ₹65k
    expect(doc.employerContributions).toBeNull(); // off by default
  });

  it("totals and words match the run (Medialoop sheet row 003: net ₹61,800)", () => {
    expect(doc.totalEarnings).toBe(65000);
    expect(doc.totalDeductions).toBe(3200);
    expect(doc.netPay).toBe(61800);
    expect(doc.netPayInWords).toBe("RUPEES SIXTY ONE THOUSAND EIGHT HUNDRED ONLY");
  });

  it("employee block: pay period, payment date, masked bank account; blanks omitted", () => {
    const right = Object.fromEntries(doc.employeeRight.map((f) => [f.label, f.value]));
    expect(right["PAY PERIOD"]).toBe("01/10/2026 - 31/10/2026");
    expect(right["PAYMENT DATE"]).toBe("01/11/2026");
    expect(right["BANK A/C"]).toBe("XXXXXX4321");
    expect(right["ESIC NO"]).toBeUndefined();
    expect(doc.footer).toContain("Questions? finance@medialoop.in");
  });

  it("employer contributions and CTC appear only when the org opts in", () => {
    const withEr = buildPayslipFromSnapshot(snapshotFor("003"), ORG, { showEmployerContributions: true });
    expect(withEr.employerContributions?.map((e) => [e.label, e.amount])).toEqual([["Employer PF", 3000]]);
    expect(withEr.ctcMonthly).toBe(68000);
  });

  it("no payment date until the month is paid", () => {
    const unpaid = buildPayslipFromSnapshot(snapshotFor("003"), ORG);
    expect(unpaid.employeeRight.find((f) => f.label === "PAYMENT DATE")).toBeUndefined();
  });
});

describe("pay slip for an entry processed before the engine", () => {
  it("renders from the stored columns, with LOP days noted", () => {
    const doc = buildPayslipFromLegacy(
      {
        employeeName: "Priya Sharma", designation: "Engineer", basic: 60000, hra: 30000, special: 55314, bonus: 0,
        employeePf: 1800, professionalTax: 200, tds: 11218, lopDays: 2, lopDeduction: 11178, latePenaltyDays: 0, latePenaltyDeduction: 0,
        lineItems: [{ label: "Diwali bonus", amount: 5000 }], totalDeductions: 24396, netPay: 125918,
      },
      "2026-06", { name: "PlayPause Studios" },
    );
    expect(doc.earnings.map((e) => e.label)).toEqual(["Basic", "HRA", "Special allowance", "Diwali bonus"]);
    expect(doc.deductions.find((d) => d.label === "Loss of pay")).toEqual({ label: "Loss of pay", amount: 11178, detail: "2 days" });
    expect(doc.org.name).toBe("PlayPause Studios");
    expect(doc.netPayInWords).toBe("RUPEES ONE LAKH TWENTY FIVE THOUSAND NINE HUNDRED EIGHTEEN ONLY");
  });
});
