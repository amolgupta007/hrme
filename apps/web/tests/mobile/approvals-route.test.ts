import { describe, it, expect, vi, beforeEach } from "vitest";

// ── mutable mock state ────────────────────────────────────────────────────────
let clerkUserId: string | null = "clerk_1";
let currentUser: any = null;

// Per-table canned results. A table can be given either a flat `{ rows, single }`
// (every query against it returns the same thing) or a `sequence: [...]` array
// consumed in call order — needed for `leave_requests`, which
// `fetchLeaveApprovals` queries twice (pending, then this-year-approved).
type TableCfg = { rows?: any[]; single?: any; error?: any; sequence?: Array<{ rows?: any[]; single?: any }> };
const tableConfig: Record<string, TableCfg> = {};
const callCounts: Record<string, number> = {};
// Records every `.in(col, vals)` filter so tests can assert scope wiring.
let inCalls: Array<[string, any]> = [];

function resetTableConfig() {
  tableConfig.leave_requests = { rows: [] };
  tableConfig.attendance_punch_events = { rows: [] };
  tableConfig.organizations = { single: { settings: { attendance: { overtime: { enabled: true } } } } };
  tableConfig.ot_records = { rows: [] };
  tableConfig.razorpayx_credentials = { single: null };
  tableConfig.disbursement_batches = { rows: [] };
  tableConfig.disbursement_items = { rows: [] };
}

function makeChain(table: string) {
  const cfg = tableConfig[table] ?? {};
  let step: { rows?: any[]; single?: any; error?: any } = cfg;
  if (cfg.sequence) {
    const idx = callCounts[table] ?? 0;
    callCounts[table] = idx + 1;
    step = cfg.sequence[idx] ?? cfg.sequence[cfg.sequence.length - 1] ?? {};
  }
  const result = { data: step.rows ?? [], error: step.error ?? null };
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    neq: () => chain,
    gte: () => chain,
    lte: () => chain,
    in: (col: string, vals: any) => {
      inCalls.push([col, vals]);
      return chain;
    },
    order: () => chain,
    single: () => Promise.resolve({ data: step.single ?? null, error: null }),
    maybeSingle: () => Promise.resolve({ data: step.single ?? null, error: null }),
    then: (resolve: any) => resolve(result),
  };
  return chain;
}

const scopeMock = vi.hoisted(() => vi.fn(async () => ["emp-2"]));

vi.mock("@clerk/nextjs/server", () => ({ auth: () => ({ userId: clerkUserId }) }));
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: vi.fn(async () => currentUser),
  isAdmin: (r: string) => r === "owner" || r === "admin",
  isManagerOrAbove: (r: string) => r === "owner" || r === "admin" || r === "manager",
}));
vi.mock("@/lib/supabase/server", () => ({
  createAdminSupabase: () => ({ from: (t: string) => makeChain(t) }),
}));
vi.mock("@/lib/attendance/manager-scope", () => ({ getManagerScopedEmployeeIds: scopeMock }));

import { GET } from "@/app/api/mobile/approvals/route";

function req(url = "http://localhost/api/mobile/approvals") {
  return new Request(url) as any;
}

const EMPLOYEE = { orgId: "org-1", orgName: "Acme", role: "employee", plan: "business", employeeId: "emp-1" };
const MANAGER = { ...EMPLOYEE, role: "manager" };
const ADMIN = { ...EMPLOYEE, role: "admin" };

beforeEach(() => {
  vi.clearAllMocks();
  clerkUserId = "clerk_1";
  currentUser = { ...EMPLOYEE };
  inCalls = [];
  for (const k of Object.keys(callCounts)) delete callCounts[k];
  resetTableConfig();
  scopeMock.mockResolvedValue(["emp-2"]);
});

describe("GET /api/mobile/approvals", () => {
  it("401 unauthenticated when there's no Clerk session", async () => {
    clerkUserId = null;
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("unauthenticated");
  });

  it("403 no_membership when the user has no org membership", async () => {
    currentUser = null;
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("no_membership");
  });

  it("returns an empty inbox ({items:[], counts all 0}) for an employee role", async () => {
    currentUser = { ...EMPLOYEE };
    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      items: [],
      counts: { leave: 0, regularization: 0, ot: 0, payroll: 0, total: 0 },
    });
  });

  it("a manager sees leave/reg/ot in scope (self-scoped, org-scoped for OT toggle)", async () => {
    currentUser = { ...MANAGER };
    tableConfig.leave_requests = {
      sequence: [
        {
          rows: [
            {
              id: "lr-1",
              employee_id: "emp-2",
              policy_id: "p1",
              start_date: "2026-08-01",
              end_date: "2026-08-02",
              days: 2,
              created_at: "2026-08-01T10:00:00Z",
              leave_policies: { name: "Casual Leave", days_per_year: 8 },
              employees: { first_name: "Ravi", last_name: "Kumar" },
            },
          ],
        },
        { rows: [] }, // approved-usage query: none this year
      ],
    };
    tableConfig.attendance_punch_events = {
      rows: [
        {
          id: "pe-1",
          employee_id: "emp-2",
          punched_at: "2026-08-10T04:00:00Z", // 09:30 IST
          punch_type: "in",
          created_at: "2026-08-10T05:00:00Z",
          employees: { first_name: "Ravi", last_name: "Kumar" },
        },
      ],
    };
    tableConfig.ot_records = {
      rows: [
        {
          id: "ot-1",
          employee_id: "emp-2",
          ot_minutes: 90,
          amount: 500,
          created_at: "2026-08-09T12:00:00Z",
          employees: { first_name: "Ravi", last_name: "Kumar" },
        },
      ],
    };

    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.counts).toEqual({ leave: 1, regularization: 1, ot: 1, payroll: 0, total: 3 });

    const leaveItem = json.items.find((i: any) => i.type === "leave");
    expect(leaveItem).toMatchObject({
      id: "lr-1",
      who: "Ravi Kumar",
      what: "Casual Leave",
      impact: "balance 8→6",
      meta: { days: 2 },
    });

    const regItem = json.items.find((i: any) => i.type === "regularization");
    expect(regItem).toMatchObject({
      id: "pe-1",
      who: "Ravi Kumar",
      what: "Manual punch",
      impact: "in 09:30 2026-08-10",
      meta: { punchAt: "2026-08-10T04:00:00Z" },
    });

    const otItem = json.items.find((i: any) => i.type === "ot");
    expect(otItem).toMatchObject({
      id: "ot-1",
      who: "Ravi Kumar",
      what: "Overtime",
      impact: "1.5h · Rs 500",
      meta: { minutes: 90 },
    });

    expect(scopeMock).toHaveBeenCalledWith("org-1", "emp-1");
    expect(inCalls).toContainEqual(["employee_id", ["emp-2"]]);
  });

  it("excludes payroll for a manager even when RazorpayX is configured (admin-only source)", async () => {
    currentUser = { ...MANAGER };
    tableConfig.razorpayx_credentials = { single: { id: "cred-1" } };
    tableConfig.disbursement_batches = {
      rows: [
        {
          id: "batch-1",
          total_amount: 100000,
          initiated_at: "2026-08-11T03:00:00Z",
          payroll_runs: { month: "2026-08" },
        },
      ],
    };
    const res = await GET(req());
    const json = await res.json();
    expect(json.counts.payroll).toBe(0);
    expect(json.items.some((i: any) => i.type === "payroll")).toBe(false);
  });

  it("excludes payroll for an admin when RazorpayX is not configured", async () => {
    currentUser = { ...ADMIN };
    tableConfig.razorpayx_credentials = { single: null };
    tableConfig.disbursement_batches = {
      rows: [
        {
          id: "batch-1",
          total_amount: 100000,
          initiated_at: "2026-08-11T03:00:00Z",
          payroll_runs: { month: "2026-08" },
        },
      ],
    };
    const res = await GET(req());
    const json = await res.json();
    expect(json.counts.payroll).toBe(0);
  });

  it("an admin sees payroll when RazorpayX is configured, normalized with headcount/exceptions", async () => {
    currentUser = { ...ADMIN };
    tableConfig.razorpayx_credentials = { single: { id: "cred-1" } };
    tableConfig.disbursement_batches = {
      rows: [
        {
          id: "batch-1",
          total_amount: 840000,
          initiated_at: "2026-08-11T03:00:00Z",
          payroll_runs: { month: "2026-08" },
        },
      ],
    };
    tableConfig.disbursement_items = {
      rows: [{ status: "pending" }, { status: "pending" }, { status: "failed" }],
    };

    const res = await GET(req());
    const json = await res.json();
    const payrollItem = json.items.find((i: any) => i.type === "payroll");
    expect(payrollItem).toMatchObject({
      id: "batch-1",
      type: "payroll",
      who: "Payroll 2026-08",
      impact: "3 staff · Rs 8,40,000",
      meta: { headcount: 3, totalPaise: 84000000, exceptions: 1 },
    });
    expect(json.counts.payroll).toBe(1);
  });

  it("response shape matches MobileApprovalsResponse ({items, counts:{leave,regularization,ot,payroll,total}})", async () => {
    currentUser = { ...ADMIN };
    const res = await GET(req());
    const json = await res.json();
    expect(Array.isArray(json.items)).toBe(true);
    expect(json.counts).toEqual(
      expect.objectContaining({
        leave: expect.any(Number),
        regularization: expect.any(Number),
        ot: expect.any(Number),
        payroll: expect.any(Number),
        total: expect.any(Number),
      }),
    );
  });
});
