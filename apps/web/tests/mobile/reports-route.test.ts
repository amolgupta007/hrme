import { describe, it, expect, beforeEach, vi } from "vitest";

// ── mutable mock state ──────────────────────────────────────────────────────
let clerkUserId: string | null = "clerk_1";
let currentUser: any = null;

// Per-table canned results — mirrors the `makeChain` idiom in
// person-profile-route.test.ts / payslips-profile-directory-routes.test.ts.
// `range()` serves the paginated fetchAllRows() calls (attendance_records,
// leave_requests); `then()` (the awaited-directly fallback) serves the
// employees head-count query, which never calls `.range()`.
const tableConfig: Record<string, { rows?: any[]; count?: number }> = {};

function resetTableConfig() {
  for (const k of Object.keys(tableConfig)) delete tableConfig[k];
}

function makeChain(table: string) {
  const cfg = tableConfig[table] ?? {};
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    neq: () => chain,
    gte: () => chain,
    lte: () => chain,
    order: () => chain,
    range: () => Promise.resolve({ data: cfg.rows ?? [], error: null }),
    then: (resolve: (v: any) => any) =>
      resolve({ data: cfg.rows ?? [], error: null, count: cfg.count ?? 0 }),
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

import { GET as attendanceGET } from "@/app/api/mobile/reports/attendance/route";
import { GET as leaveGET } from "@/app/api/mobile/reports/leave/route";

function req(path: string, params: Record<string, string> = {}) {
  const url = new URL(`http://localhost${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString()) as any;
}

function callAttendance(params: Record<string, string> = { from: "2026-08-01", to: "2026-08-02" }) {
  return attendanceGET(req("/api/mobile/reports/attendance", params));
}
function callLeave(params: Record<string, string> = { from: "2026-08-01", to: "2026-08-02" }) {
  return leaveGET(req("/api/mobile/reports/leave", params));
}

const EMPLOYEE = { orgId: "org-1", orgName: "Acme", role: "employee", plan: "business", employeeId: "emp-1" };
const MANAGER = { ...EMPLOYEE, role: "manager" };
const ADMIN = { ...EMPLOYEE, role: "admin" };

beforeEach(() => {
  vi.clearAllMocks();
  clerkUserId = "clerk_1";
  currentUser = { ...ADMIN };
  resetTableConfig();
  tableConfig.employees = { count: 0 };
  tableConfig.attendance_records = { rows: [] };
  tableConfig.leave_requests = { rows: [] };
});

describe.each([
  ["attendance", () => callAttendance()],
  ["leave", () => callLeave()],
])("GET /api/mobile/reports/%s — auth", (_name, call) => {
  it("401 unauthenticated when no Clerk session", async () => {
    clerkUserId = null;
    const res = await call();
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("unauthenticated");
  });

  it("403 no_membership when no org membership", async () => {
    currentUser = null;
    const res = await call();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("no_membership");
  });

  it("403 forbidden for a plain employee", async () => {
    currentUser = { ...EMPLOYEE };
    const res = await call();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("forbidden");
  });

  it("403 forbidden for a plain manager (admin-only)", async () => {
    currentUser = { ...MANAGER };
    const res = await call();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("forbidden");
  });

  it("200 for an admin", async () => {
    currentUser = { ...ADMIN };
    const res = await call();
    expect(res.status).toBe(200);
  });
});

describe.each([
  ["attendance", (p: Record<string, string>) => callAttendance(p)],
  ["leave", (p: Record<string, string>) => callLeave(p)],
])("GET /api/mobile/reports/%s — range validation", (_name, call) => {
  it("400 when 'to' is missing", async () => {
    const res = await call({ from: "2026-08-01" });
    expect(res.status).toBe(400);
  });

  it("400 when 'from' is missing", async () => {
    const res = await call({ to: "2026-08-01" });
    expect(res.status).toBe(400);
  });

  it("400 on malformed date strings", async () => {
    const res = await call({ from: "2026/08/01", to: "2026/08/02" });
    expect(res.status).toBe(400);
  });

  it("400 when from > to", async () => {
    const res = await call({ from: "2026-08-10", to: "2026-08-01" });
    expect(res.status).toBe(400);
  });

  it("400 when the span exceeds 92 days", async () => {
    const res = await call({ from: "2026-01-01", to: "2026-12-31" }); // 365 days
    expect(res.status).toBe(400);
  });

  it("200 when the span is exactly 92 days (boundary)", async () => {
    // 2026-01-01 .. 2026-04-02 inclusive = 92 days
    const res = await call({ from: "2026-01-01", to: "2026-04-02" });
    expect(res.status).toBe(200);
  });
});

describe("GET /api/mobile/reports/attendance — happy path shape", () => {
  it("aggregates present/late per day and org-wide presentPct/lateCount", async () => {
    tableConfig.employees = { count: 2 };
    tableConfig.attendance_records = {
      rows: [
        { date: "2026-08-01", employee_id: "e1", is_late: false },
        { date: "2026-08-01", employee_id: "e2", is_late: true },
        { date: "2026-08-02", employee_id: "e1", is_late: false },
      ],
    };

    const res = await callAttendance({ from: "2026-08-01", to: "2026-08-02" });
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.range).toEqual({ from: "2026-08-01", to: "2026-08-02" });
    expect(json.perDay).toEqual([
      { date: "2026-08-01", present: 2, late: 1 },
      { date: "2026-08-02", present: 1, late: 0 },
    ]);
    expect(json.lateCount).toBe(1);
    // totalSlots = 2 employees * 2 days = 4; totalPresent = 2 + 1 = 3 -> 75%
    expect(json.presentPct).toBe(75);
  });

  it("presentPct is 0 (not NaN) when there are no active employees", async () => {
    tableConfig.employees = { count: 0 };
    tableConfig.attendance_records = { rows: [] };
    const res = await callAttendance({ from: "2026-08-01", to: "2026-08-01" });
    const json = await res.json();
    expect(json.presentPct).toBe(0);
    expect(json.perDay).toEqual([{ date: "2026-08-01", present: 0, late: 0 }]);
  });
});

describe("GET /api/mobile/reports/leave — happy path shape", () => {
  it("sums approved leave days grouped by type", async () => {
    tableConfig.leave_requests = {
      rows: [
        { leave_type: "casual", days: 2 },
        { leave_type: "sick", days: 1 },
        { leave_type: "casual", days: 3 },
      ],
    };

    const res = await callLeave({ from: "2026-08-01", to: "2026-08-31" });
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.range).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(json.totalDays).toBe(6);
    expect(json.byType).toEqual(
      expect.arrayContaining([
        { type: "casual", days: 5 },
        { type: "sick", days: 1 },
      ]),
    );
  });

  it("totalDays is 0 with an empty byType when there's no approved leave", async () => {
    tableConfig.leave_requests = { rows: [] };
    const res = await callLeave({ from: "2026-08-01", to: "2026-08-31" });
    const json = await res.json();
    expect(json.totalDays).toBe(0);
    expect(json.byType).toEqual([]);
  });
});
