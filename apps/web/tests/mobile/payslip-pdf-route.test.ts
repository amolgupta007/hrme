import { describe, it, expect, beforeEach, vi } from "vitest";

// ── mutable mock state ────────────────────────────────────────────────────────
let clerkUserId: string | null = "clerk_1";
let currentUser: any = null;

const tableConfig: Record<string, { single?: any; rows?: any[] }> = {};

function resetTableConfig() {
  for (const k of Object.keys(tableConfig)) delete tableConfig[k];
}

function makeChain(table: string) {
  const cfg = tableConfig[table] ?? {};
  const awaitResult = { data: cfg.rows ?? [], error: null };
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    maybeSingle: () => Promise.resolve({ data: cfg.single ?? null, error: null }),
    single: () => Promise.resolve({ data: cfg.single ?? null, error: null }),
    then: (resolve: (v: any) => any) => resolve(awaitResult),
  };
  return chain;
}

vi.mock("@clerk/nextjs/server", () => ({ auth: () => ({ userId: clerkUserId }) }));
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: vi.fn(async () => currentUser),
}));
vi.mock("@/lib/supabase/server", () => ({
  createAdminSupabase: () => ({ from: (t: string) => makeChain(t) }),
}));

import { GET as pdfGET } from "@/app/api/mobile/payslips/[entryId]/pdf/route";

function req(url = "http://localhost/api/mobile/payslips/e-1/pdf", init?: RequestInit) {
  return new Request(url, init) as any;
}

const EMPLOYEE = { orgId: "org-1", orgName: "Acme", role: "employee", plan: "business", employeeId: "emp-1" };

const fullEntry = (over: Record<string, unknown> = {}) => ({
  id: "e-1",
  org_id: "org-1",
  employee_id: "emp-1",
  basic_monthly: 20000,
  hra_monthly: 10000,
  special_allowance_monthly: 5000,
  gross_salary: 35000,
  employee_pf: 1800,
  professional_tax: 200,
  tds: 1500,
  lop_days: 0,
  lop_deduction: 0,
  bonus: 0,
  total_deductions: 3500,
  net_pay: 31500,
  run: { id: "r-1", month: "2026-06", status: "paid", paid_at: "2026-07-01" },
  ...over,
});

function seedHappyPath() {
  tableConfig.payroll_entries = { single: fullEntry() };
  tableConfig.payroll_line_items = { rows: [] };
  tableConfig.organizations = { single: { name: "Acme Corp" } };
  tableConfig.employees = { single: { first_name: "Ravi", last_name: "Kumar", designation: "Engineer" } };
}

beforeEach(() => {
  vi.clearAllMocks();
  clerkUserId = "clerk_1";
  currentUser = { ...EMPLOYEE };
  resetTableConfig();
});

describe("GET /api/mobile/payslips/[entryId]/pdf — auth", () => {
  it("401 when no Clerk session", async () => {
    clerkUserId = null;
    const res = await pdfGET(req(), { params: { entryId: "e-1" } });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("unauthenticated");
  });

  it("403 when no org membership", async () => {
    currentUser = null;
    const res = await pdfGET(req(), { params: { entryId: "e-1" } });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("no_membership");
  });
});

describe("GET /api/mobile/payslips/[entryId]/pdf — IDOR + draft guards", () => {
  it("404 when the entry belongs to ANOTHER employee (same org)", async () => {
    seedHappyPath();
    tableConfig.payroll_entries = { single: fullEntry({ employee_id: "emp-999" }) };
    const res = await pdfGET(req(), { params: { entryId: "e-1" } });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_found");
  });

  it("404 when the entry belongs to ANOTHER org", async () => {
    seedHappyPath();
    tableConfig.payroll_entries = { single: fullEntry({ org_id: "org-999" }) };
    const res = await pdfGET(req(), { params: { entryId: "e-1" } });
    expect(res.status).toBe(404);
  });

  it("404 when the entry does not exist", async () => {
    seedHappyPath();
    tableConfig.payroll_entries = { single: null };
    const res = await pdfGET(req(), { params: { entryId: "e-1" } });
    expect(res.status).toBe(404);
  });

  it("404 when the run is still a draft", async () => {
    seedHappyPath();
    tableConfig.payroll_entries = {
      single: fullEntry({ run: { id: "r-1", month: "2026-06", status: "draft", paid_at: null } }),
    };
    const res = await pdfGET(req(), { params: { entryId: "e-1" } });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/mobile/payslips/[entryId]/pdf — 200", () => {
  it("returns application/pdf with an attachment filename", async () => {
    seedHappyPath();
    const res = await pdfGET(req(), { params: { entryId: "e-1" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const cd = res.headers.get("content-disposition") ?? "";
    expect(cd).toContain("attachment");
    expect(cd).toContain("payslip-2026-06.pdf");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
