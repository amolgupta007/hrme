import { describe, it, expect, vi, beforeEach } from "vitest";

// ── mutable mock state ────────────────────────────────────────────────────────
let clerkUserId: string | null = "clerk_1";
let currentUser: any = null;

// Per-table canned results — mirrors the `makeChain` idiom in routes.test.ts /
// approvals-route.test.ts. `single` serves maybeSingle()/single(); `rows`
// (+ `count`) serves the awaited (thenable) chain and `.limit()`.
type TableCfg = { rows?: any[]; single?: any; count?: number };
const tableConfig: Record<string, TableCfg> = {};

function resetTableConfig() {
  tableConfig.employees = { rows: [], count: 5 };
  tableConfig.attendance_records = {
    single: { clock_in_at: null, clock_out_at: null, total_minutes: null },
    rows: [],
  };
  tableConfig.shift_assignments = { rows: [] };
  tableConfig.leave_policies = { rows: [] };
  tableConfig.leave_requests = { rows: [], count: 0 };
  tableConfig.holidays = { rows: [] };
  tableConfig.attendance_punch_events = { rows: [], count: 0 };
  tableConfig.training_enrollments = { rows: [], count: 0 };
  tableConfig.announcements = { rows: [] };
  tableConfig.notifications = { rows: [], count: 0 };
  tableConfig.payroll_runs = { single: null };
}

function makeChain(table: string) {
  const cfg = tableConfig[table] ?? {};
  const awaitResult = {
    data: cfg.rows ?? [],
    count: cfg.count ?? (cfg.rows ? cfg.rows.length : 0),
    error: null,
  };
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    neq: () => chain,
    gte: () => chain,
    lte: () => chain,
    in: () => chain,
    is: () => chain,
    order: () => chain,
    limit: () => Promise.resolve(awaitResult),
    maybeSingle: () => Promise.resolve({ data: cfg.single ?? null, error: null }),
    single: () => Promise.resolve({ data: cfg.single ?? null, error: null }),
    then: (resolve: (v: any) => any) => resolve(awaitResult),
  };
  return chain;
}

// ── module mocks (registered before importing the route) ──────────────────────
vi.mock("@clerk/nextjs/server", () => ({ auth: () => ({ userId: clerkUserId }) }));
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: vi.fn(async () => currentUser),
  isAdmin: (role: string) => role === "owner" || role === "admin",
  isManagerOrAbove: (role: string) => role === "owner" || role === "admin" || role === "manager",
}));
vi.mock("@/lib/supabase/server", () => ({
  createAdminSupabase: () => ({ from: (t: string) => makeChain(t) }),
}));
vi.mock("@/lib/attendance/manager-scope", () => ({
  getManagerScopedEmployeeIds: vi.fn(async () => []),
}));

const fetchLeaveApprovals = vi.fn(async () => [] as any[]);
const fetchRegularizationApprovals = vi.fn(async () => [] as any[]);
const fetchOtApprovals = vi.fn(async () => [] as any[]);
const fetchPayrollApprovals = vi.fn(async () => [] as any[]);
vi.mock("@/lib/mobile/approvals-sources", () => ({
  fetchLeaveApprovals: (...args: any[]) => fetchLeaveApprovals(...args),
  fetchRegularizationApprovals: (...args: any[]) => fetchRegularizationApprovals(...args),
  fetchOtApprovals: (...args: any[]) => fetchOtApprovals(...args),
  fetchPayrollApprovals: (...args: any[]) => fetchPayrollApprovals(...args),
}));

import { GET } from "@/app/api/mobile/home/route";

function req(url = "http://localhost/api/mobile/home") {
  return new Request(url) as any;
}

const EMPLOYEE = { orgId: "org-1", orgName: "Acme", role: "employee", plan: "business", employeeId: "emp-1" };
const MANAGER = { ...EMPLOYEE, role: "manager" };
const ADMIN = { ...EMPLOYEE, role: "admin" };

beforeEach(() => {
  vi.clearAllMocks();
  clerkUserId = "clerk_1";
  currentUser = { ...EMPLOYEE };
  resetTableConfig();
  fetchLeaveApprovals.mockResolvedValue([]);
  fetchRegularizationApprovals.mockResolvedValue([]);
  fetchOtApprovals.mockResolvedValue([]);
  fetchPayrollApprovals.mockResolvedValue([]);
});

describe("GET /api/mobile/home — adminHome block (Mobile D4 Task 5)", () => {
  it("is absent for employees (and never queries the admin sources)", async () => {
    currentUser = { ...EMPLOYEE };
    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect("adminHome" in json).toBe(false);
    expect(fetchLeaveApprovals).not.toHaveBeenCalled();
    expect(fetchRegularizationApprovals).not.toHaveBeenCalled();
    expect(fetchOtApprovals).not.toHaveBeenCalled();
  });

  it("is present for managers with today counts, pendingApprovals byType/total, and payroll status", async () => {
    currentUser = { ...MANAGER };
    tableConfig.employees = { rows: [], count: 5 };
    tableConfig.attendance_records = {
      single: { clock_in_at: null, clock_out_at: null, total_minutes: null },
      rows: [
        { clock_in_at: "2026-08-12T04:00:00Z", is_late: false },
        { clock_in_at: "2026-08-12T05:00:00Z", is_late: true },
        { clock_in_at: null, is_late: null },
      ],
    };
    tableConfig.payroll_runs = { single: { month: "2026-08", status: "processed" } };
    fetchLeaveApprovals.mockResolvedValue([{ id: "l1" }, { id: "l2" }]);
    fetchRegularizationApprovals.mockResolvedValue([{ id: "r1" }]);
    // A manager must never see OT here even if the fetcher WOULD return
    // items — the route must gate the call itself, not rely on empty data.
    fetchOtApprovals.mockResolvedValue([{ id: "ot1" }]);

    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = await res.json();

    // OT and payroll approvals are admin-only — a manager must never trigger
    // either fetch, so their byType counts are 0 regardless of what the
    // fetchers would return.
    expect(fetchOtApprovals).not.toHaveBeenCalled();
    expect(fetchPayrollApprovals).not.toHaveBeenCalled();

    expect(json.adminHome).toBeDefined();
    expect(json.adminHome.today).toEqual({ present: 2, absent: 3, late: 1 });
    expect(json.adminHome.pendingApprovals).toEqual({
      total: 3,
      byType: { leave: 2, regularization: 1, ot: 0, payroll: 0 },
    });
    // `processed` with no pending disbursement-approval → "processing".
    expect(json.adminHome.payroll).toEqual({ status: "processing", month: "2026-08" });

    // The rest of Home stays intact alongside the admin block.
    expect(json.today).toBeDefined();
    expect(Array.isArray(json.leave.balances)).toBe(true);
  });

  it("reads an admin's payroll approval as awaiting_approval and counts it in byType", async () => {
    currentUser = { ...ADMIN };
    tableConfig.payroll_runs = { single: { month: "2026-08", status: "processed" } };
    fetchPayrollApprovals.mockResolvedValue([{ id: "batch-1" }]);

    const res = await GET(req());
    const json = await res.json();

    expect(fetchPayrollApprovals).toHaveBeenCalled();
    expect(json.adminHome.pendingApprovals.byType.payroll).toBe(1);
    expect(json.adminHome.payroll).toEqual({ status: "awaiting_approval", month: "2026-08" });
  });

  it("fetches and counts OT for an admin (OT is admin-gated, mirrors payroll)", async () => {
    currentUser = { ...ADMIN };
    fetchOtApprovals.mockResolvedValue([{ id: "ot1" }, { id: "ot2" }]);

    const res = await GET(req());
    const json = await res.json();

    expect(fetchOtApprovals).toHaveBeenCalled();
    expect(json.adminHome.pendingApprovals.byType.ot).toBe(2);
  });

  it("reports payroll as null when the org's plan doesn't include the payroll feature", async () => {
    currentUser = { ...MANAGER, plan: "growth" };
    // Even without payroll, the block itself must still be present.
    const res = await GET(req());
    const json = await res.json();

    expect(json.adminHome).toBeDefined();
    expect(json.adminHome.payroll).toBeNull();
  });

  it("drops the whole block (not a partial one) when a sub-query throws, leaving the rest of Home intact", async () => {
    currentUser = { ...ADMIN };
    fetchOtApprovals.mockRejectedValue(new Error("boom"));

    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = await res.json();

    expect("adminHome" in json).toBe(false);
    expect(json.today).toBeDefined();
    expect(Array.isArray(json.nextHolidays)).toBe(true);
    expect(Array.isArray(json.announcements)).toBe(true);
    expect(typeof json.unreadNotifications).toBe("number");
  });
});
