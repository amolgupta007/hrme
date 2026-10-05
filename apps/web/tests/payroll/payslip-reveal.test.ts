import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/crypto/aes-gcm", () => ({
  isEncryptionConfigured: () => true,
  decrypt: (s: string) => s.replace(/^enc:/, ""),
}));

import { loadPayslip } from "@/lib/payroll/payslip-data";

const ORG = "org-1";
const OWNER = "emp-owner";

function fakeDb(opts: { runStatus?: string; showFullAadhaar?: boolean; hideBank?: boolean } = {}) {
  const inserts: { table: string; row: any }[] = [];
  const rows: Record<string, any> = {
    payroll_entries: {
      id: "entry-1", org_id: ORG, employee_id: OWNER,
      snapshot: {
        month: "2026-09",
        employee: { name: "Sakshi Madhikar", bankLast4: "6789", aadhaarLast4: "9012" },
        days: { basis: 30, paid: 30, lop: 0, latePenalty: 0 },
        lines: [{ code: "BASIC", label: "Basic", kind: "earning", amount: 50000, source: "component", showOnPayslip: true, order: 1 }],
        totals: { gross: 50000, deductions: 0, employer: 0, net: 50000, ctcMonthly: 50000 },
      },
      run: { month: "2026-09", status: opts.runStatus ?? "processed", paid_at: null, settings_snapshot: null },
      employee: {},
    },
    organizations: {
      name: "Medialoop", address: null, gstin: null, pan: null, tan: null, pf_establishment_code: null, esi_code: null, logo_url: null,
      settings: {
        payslip: {
          showFullAadhaarToEmployee: !!opts.showFullAadhaar,
          employeeFields: opts.hideBank ? { bank_account: { show: false } } : {},
        },
      },
    },
    employee_bank_accounts: { account_number_encrypted: "enc:123456789" },
    employees: { aadhar_number: "1234 5678 9012" },
  };
  const chain = (table: string): any => {
    const q: any = {
      select: () => q, eq: () => q,
      maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
      single: async () => ({ data: rows[table] ?? null, error: null }),
      insert: async (row: any) => { inserts.push({ table, row }); return { error: null }; },
    };
    return q;
  };
  return { sb: { from: chain, storage: { from: () => ({ download: async () => ({ data: null, error: null }) }) } } as any, inserts };
}

const field = (doc: any, label: string) => [...doc.employeeLeft, ...doc.employeeRight].find((f: any) => f.label === label)?.value;

describe("pay slip: full bank / Aadhaar only for the slip's own employee", () => {
  it("the employee sees their full bank account; Aadhaar stays masked by default; the read is logged", async () => {
    const { sb, inserts } = fakeDb();
    const slip = await loadPayslip(sb, ORG, "entry-1", { employeeId: OWNER });
    expect(field(slip!.doc, "BANK A/C")).toBe("123456789");
    expect(field(slip!.doc, "AADHAAR")).toBe("XXXX XXXX 9012");
    expect(inserts).toEqual([
      expect.objectContaining({ table: "disbursement_audit_log", row: expect.objectContaining({ action: "bank_account_read", actor_id: OWNER }) }),
    ]);
  });

  it("full Aadhaar too when the company switches it on", async () => {
    const { sb } = fakeDb({ showFullAadhaar: true });
    const slip = await loadPayslip(sb, ORG, "entry-1", { employeeId: OWNER });
    expect(field(slip!.doc, "AADHAAR")).toBe("1234 5678 9012");
  });

  it("admins viewing someone else's slip, and the email (no viewer), get masked numbers and no decryption", async () => {
    for (const viewer of [{ employeeId: "emp-admin" }, null]) {
      const { sb, inserts } = fakeDb({ showFullAadhaar: true });
      const slip = await loadPayslip(sb, ORG, "entry-1", viewer);
      expect(field(slip!.doc, "BANK A/C")).toBe("XXXXXX6789");
      expect(field(slip!.doc, "AADHAAR")).toBe("XXXX XXXX 9012");
      expect(inserts).toHaveLength(0);
    }
  });

  it("never reveals on a draft run, and doesn't decrypt a line the company hid", async () => {
    const draft = fakeDb({ runStatus: "draft" });
    const d = await loadPayslip(draft.sb, ORG, "entry-1", { employeeId: OWNER });
    expect(field(d!.doc, "BANK A/C")).toBe("XXXXXX6789");
    expect(draft.inserts).toHaveLength(0);

    const hidden = fakeDb({ hideBank: true });
    const h = await loadPayslip(hidden.sb, ORG, "entry-1", { employeeId: OWNER });
    expect(field(h!.doc, "BANK A/C")).toBeUndefined();
    expect(hidden.inserts).toHaveLength(0);
  });
});
