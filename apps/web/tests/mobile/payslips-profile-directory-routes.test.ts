import { describe, it, expect, beforeEach, vi } from "vitest";

// ── mutable mock state ────────────────────────────────────────────────────────
let clerkUserId: string | null = "clerk_1";
let currentUser: any = null;

const tableConfig: Record<string, { single?: any; rows?: any[] }> = {};
let updateCalls: Array<[string, Record<string, unknown>]> = [];

function resetTableConfig() {
  for (const k of Object.keys(tableConfig)) delete tableConfig[k];
}

function makeChain(table: string) {
  const cfg = tableConfig[table] ?? {};
  const awaitResult = { data: cfg.rows ?? [], error: null };
  const chain: any = {
    select: () => chain,
    insert: () => Promise.resolve({ data: null, error: null }),
    update: (patch: Record<string, unknown>) => {
      updateCalls.push([table, patch]);
      return chain;
    },
    eq: () => chain,
    neq: () => chain,
    gte: () => chain,
    lte: () => chain,
    lt: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => Promise.resolve(awaitResult),
    maybeSingle: () => Promise.resolve({ data: cfg.single ?? null, error: null }),
    single: () => Promise.resolve({ data: cfg.single ?? null, error: null }),
    then: (resolve: (v: any) => any) => resolve(awaitResult),
  };
  return chain;
}

vi.mock("@clerk/nextjs/server", () => ({ auth: () => ({ userId: clerkUserId }) }));
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: vi.fn(async () => currentUser),
  isAdmin: (r: string) => r === "owner" || r === "admin",
  isManagerOrAbove: (r: string) => r === "owner" || r === "admin" || r === "manager",
}));
vi.mock("@/lib/supabase/server", () => ({
  createAdminSupabase: () => ({ from: (t: string) => makeChain(t) }),
}));

import { GET as payslipsGET } from "@/app/api/mobile/payslips/route";
import { GET as payslipDetailGET } from "@/app/api/mobile/payslips/[entryId]/route";
import { GET as profileGET, POST as profilePOST } from "@/app/api/mobile/profile/route";
import { GET as directoryGET } from "@/app/api/mobile/directory/route";

function req(url = "http://localhost/api/mobile/x", init?: RequestInit) {
  return new Request(url, init) as any;
}
function post(url: string, bodyObj: unknown) {
  return req(url, { method: "POST", body: JSON.stringify(bodyObj) });
}

const EMPLOYEE = { orgId: "org-1", orgName: "Acme", role: "employee", plan: "business", employeeId: "emp-1" };

beforeEach(() => {
  vi.clearAllMocks();
  clerkUserId = "clerk_1";
  currentUser = { ...EMPLOYEE };
  updateCalls = [];
  resetTableConfig();
});

// ── shared auth contract ──────────────────────────────────────────────────────
const routes = [
  { name: "GET /payslips", call: () => payslipsGET(req()) },
  { name: "GET /payslips/[entryId]", call: () => payslipDetailGET(req(), { params: { entryId: "e-1" } }) },
  { name: "GET /profile", call: () => profileGET(req()) },
  { name: "POST /profile", call: () => profilePOST(post("http://localhost/api/mobile/profile", {})) },
  { name: "GET /directory", call: () => directoryGET(req()) },
];

for (const r of routes) {
  describe(r.name, () => {
    it("401 unauthenticated when no Clerk session", async () => {
      clerkUserId = null;
      const res = await r.call();
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe("unauthenticated");
    });
    it("403 no_membership when no org membership", async () => {
      currentUser = null;
      const res = await r.call();
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe("no_membership");
    });
  });
}

// ── GET /payslips ─────────────────────────────────────────────────────────────
describe("GET /api/mobile/payslips (200)", () => {
  it("returns non-draft entries month-desc", async () => {
    tableConfig.payroll_entries = {
      rows: [
        { id: "e-jun", net_pay: 50000, run: { id: "r-jun", month: "2026-06", status: "paid", paid_at: "2026-07-01" } },
        { id: "e-jul", net_pay: 51000, run: { id: "r-jul", month: "2026-07", status: "draft", paid_at: null } },
      ],
    };
    const res = await payslipsGET(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(json[0]).toMatchObject({ entryId: "e-jun", runId: "r-jun", month: "2026-06", netPay: 50000 });
  });
});

// ── GET /payslips/[entryId] — IDOR ────────────────────────────────────────────
describe("GET /api/mobile/payslips/[entryId] IDOR guard", () => {
  const fullEntry = (over: Record<string, unknown>) => ({
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

  it("404 when the entry belongs to ANOTHER employee (same org)", async () => {
    tableConfig.payroll_entries = { single: fullEntry({ employee_id: "emp-999" }) };
    const res = await payslipDetailGET(req(), { params: { entryId: "e-1" } });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_found");
  });

  it("404 when the entry belongs to ANOTHER org", async () => {
    tableConfig.payroll_entries = { single: fullEntry({ org_id: "org-999" }) };
    const res = await payslipDetailGET(req(), { params: { entryId: "e-1" } });
    expect(res.status).toBe(404);
  });

  it("404 when the entry does not exist", async () => {
    tableConfig.payroll_entries = { single: null };
    const res = await payslipDetailGET(req(), { params: { entryId: "e-1" } });
    expect(res.status).toBe(404);
  });

  it("200 with full detail + line items for the caller's own entry", async () => {
    tableConfig.payroll_entries = { single: fullEntry({}) };
    tableConfig.payroll_line_items = {
      rows: [{ category: "allowance", note: "Travel", amount: 1200, taxable: true }],
    };
    const res = await payslipDetailGET(req(), { params: { entryId: "e-1" } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.entryId).toBe("e-1");
    expect(json.earnings.gross).toBe(35000);
    expect(json.lineItems).toEqual([{ category: "allowance", label: "Travel", amount: 1200, taxable: true }]);
  });
});

// ── Profile ───────────────────────────────────────────────────────────────────
const profileRow = {
  id: "emp-1",
  first_name: "Ravi",
  last_name: "Kumar",
  designation: "Engineer",
  email: "ravi@acme.com",
  personal_email: "ravi@gmail.com",
  phone: "+919000000000",
  gender: "male",
  pronouns: "he/him",
  marital_status: "single",
  country: "India",
  date_of_birth: "1995-01-01",
  communication_address: null,
  permanent_address: null,
  emergency_contact_name: "Sita",
  emergency_contact_phone: "+919111111111",
  emergency_contact_relationship: "Spouse",
  whatsapp_opt_in: true,
  avatar_url: null,
  pan_number: "ABCDE1234F",
  aadhar_number: "123456789012",
  departments: { name: "Engineering" },
};

describe("GET /api/mobile/profile", () => {
  it("masks PAN/Aadhaar and never returns the raw values or salary", async () => {
    tableConfig.employees = { single: profileRow };
    const res = await profileGET(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.panMasked).toBe("••••234F");
    expect(json.aadhaarMasked).toBe("••••9012");
    const body = JSON.stringify(json).toLowerCase();
    expect(body).not.toContain("abcde1234f");
    expect(body).not.toContain("123456789012");
    expect(body).not.toContain("ctc");
    expect(body).not.toContain("salary");
  });
});

describe("POST /api/mobile/profile", () => {
  it("rejects a PAN/Aadhaar write attempt (strict schema) and issues NO update", async () => {
    tableConfig.employees = { single: profileRow };
    const res = await profilePOST(
      post("http://localhost/api/mobile/profile", {
        phone: "+919222222222",
        panNumber: "ZZZZZ9999Z",
        aadharNumber: "999999999999",
      }),
    );
    expect(res.status).toBe(400);
    expect(updateCalls.filter(([t]) => t === "employees")).toHaveLength(0);
  });

  it("updates only whitelisted columns and returns the masked profile", async () => {
    tableConfig.employees = { single: profileRow };
    const res = await profilePOST(
      post("http://localhost/api/mobile/profile", {
        phone: "+919222222222",
        emergencyContact: { name: "Gita", phone: "+919333333333", relationship: "Sister" },
        whatsappOptIn: false,
      }),
    );
    expect(res.status).toBe(200);
    const empUpdates = updateCalls.filter(([t]) => t === "employees");
    expect(empUpdates).toHaveLength(1);
    const patch = empUpdates[0][1];
    expect(patch.phone).toBe("+919222222222");
    expect(patch.emergency_contact_name).toBe("Gita");
    expect(patch.whatsapp_opt_in).toBe(false);
    expect(patch).not.toHaveProperty("pan_number");
    expect(patch).not.toHaveProperty("first_name");
    // Response is still the masked profile shape:
    expect((await res.json()).panMasked).toBe("••••234F");
  });
});

// ── Directory ─────────────────────────────────────────────────────────────────
describe("GET /api/mobile/directory (200)", () => {
  it("returns employee-safe rows", async () => {
    tableConfig.employees = {
      rows: [
        {
          id: "e1",
          first_name: "Ravi",
          last_name: "Kumar",
          email: "ravi@acme.com",
          phone: "+919000000000",
          role: "manager",
          avatar_url: null,
          departments: { name: "Sales" },
        },
      ],
    };
    const res = await directoryGET(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json[0]).toEqual({
      id: "e1",
      name: "Ravi Kumar",
      initials: "RK",
      department: "Sales",
      roleBadge: "manager",
      avatarUrl: null,
      email: "ravi@acme.com",
      phone: "+919000000000",
    });
  });
});
