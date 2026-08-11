import { describe, it, expect, beforeEach, vi } from "vitest";

// ── mutable mock state ────────────────────────────────────────────────────────
let clerkUserId: string | null = "clerk_1";
let currentUser: any = null;

// Per-table canned results — mirrors the `makeChain` idiom in
// payslips-profile-directory-routes.test.ts. `single` serves
// maybeSingle()/single(); `rows` serves an awaited (thenable) chain / .limit().
//
// The route now issues TWO separate `leave_requests` queries (Finding 1 fix):
// an unlimited `status='approved'` + current-year query for the balance sum,
// and a `limit(30)` any-status query for the recent-requests list. Both hit
// the same mocked table, so the chain distinguishes them by whether
// `.eq("status", "approved")` was called: `approvedRows` backs that query,
// `rows` backs the `.limit()`'d recent-requests query (and remains the
// fallback for every other table that only ever needs one dataset).
const tableConfig: Record<string, { single?: any; rows?: any[]; approvedRows?: any[] }> = {};

// Records every .neq(col, val) call per table so tests can assert the route
// actually applies a filter (not just infer it from data-shape side effects).
const neqCalls: Record<string, [string, unknown][]> = {};

function resetTableConfig() {
  for (const k of Object.keys(tableConfig)) delete tableConfig[k];
  for (const k of Object.keys(neqCalls)) delete neqCalls[k];
}

function makeChain(table: string) {
  const cfg = tableConfig[table] ?? {};
  let approvedMode = false;
  const chain: any = {
    select: () => chain,
    eq: (col: string, val: any) => {
      if (col === "status" && val === "approved") approvedMode = true;
      return chain;
    },
    neq: (col: string, val: any) => {
      (neqCalls[table] ??= []).push([col, val]);
      return chain;
    },
    gte: () => chain,
    lte: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => Promise.resolve({ data: cfg.rows ?? [], error: null }),
    maybeSingle: () => Promise.resolve({ data: cfg.single ?? null, error: null }),
    single: () => Promise.resolve({ data: cfg.single ?? null, error: null }),
    then: (resolve: (v: any) => any) =>
      resolve({ data: (approvedMode ? cfg.approvedRows : cfg.rows) ?? [], error: null }),
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

import { GET } from "@/app/api/mobile/directory/[id]/route";

function req(url = "http://localhost/api/mobile/directory/emp-target") {
  return new Request(url) as any;
}
function call(id = "emp-target") {
  return GET(req(), { params: { id } });
}

const EMPLOYEE = { orgId: "org-1", orgName: "Acme", role: "employee", plan: "business", employeeId: "emp-1" };
const MANAGER = { ...EMPLOYEE, role: "manager" };
const ADMIN = { ...EMPLOYEE, role: "admin" };

const targetRow = (over: Record<string, unknown> = {}) => ({
  id: "emp-target",
  org_id: "org-1",
  first_name: "Priya",
  last_name: "Shah",
  role: "employee",
  phone: "+919000000001",
  personal_email: "priya@gmail.com",
  whatsapp_opt_in: true,
  departments: { name: "Engineering" },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  clerkUserId = "clerk_1";
  currentUser = { ...MANAGER };
  resetTableConfig();
  tableConfig.employees = { single: targetRow() };
  tableConfig.attendance_records = { single: null };
  tableConfig.leave_policies = { rows: [] };
  tableConfig.leave_requests = { rows: [] };
});

describe("GET /api/mobile/directory/[id] — auth", () => {
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

  it("403 forbidden for a plain employee (not manager+)", async () => {
    currentUser = { ...EMPLOYEE };
    const res = await call();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("forbidden");
  });

  it("200 for a manager", async () => {
    currentUser = { ...MANAGER };
    const res = await call();
    expect(res.status).toBe(200);
  });

  it("200 for an admin", async () => {
    currentUser = { ...ADMIN };
    const res = await call();
    expect(res.status).toBe(200);
  });
});

describe("GET /api/mobile/directory/[id] — IDOR guard", () => {
  it("404 when the target belongs to ANOTHER org", async () => {
    tableConfig.employees = { single: targetRow({ org_id: "org-999" }) };
    const res = await call();
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_found");
  });

  it("404 when the target does not exist", async () => {
    tableConfig.employees = { single: null };
    const res = await call();
    expect(res.status).toBe(404);
  });

  it("404 when the target employee is terminated", async () => {
    // The route adds .neq("status", "terminated") to the employees lookup
    // (Finding 2 parity fix — matches /api/mobile/directory and /api/mobile/me).
    // The mock chain's .neq() is a generic pass-through (it doesn't re-filter
    // `single`), so a terminated target is simulated the same way Postgrest
    // would represent it once that filter is applied server-side: no matching
    // row. We additionally assert the route actually issues the filter, so
    // this doesn't silently degenerate into a duplicate of the
    // "does not exist" case.
    tableConfig.employees = { single: null };
    const res = await call();
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_found");
    expect(neqCalls.employees).toContainEqual(["status", "terminated"]);
  });
});

describe("GET /api/mobile/directory/[id] — 200 shape", () => {
  it("returns the mini-profile shape with no salary/PAN/Aadhaar/bank/CTC anywhere in the payload", async () => {
    tableConfig.employees = { single: targetRow() };
    tableConfig.attendance_records = {
      single: { clock_in_at: "2026-08-12T04:00:00Z", clock_out_at: null },
    };
    tableConfig.leave_policies = {
      rows: [
        { id: "p1", type: "paid", days_per_year: 18 },
        { id: "p2", type: "sick", days_per_year: 8 },
      ],
    };
    tableConfig.leave_requests = {
      // Recent-requests list: any status, newest first (route's second query).
      rows: [
        { policy_id: "p1", leave_type: "paid", status: "approved", start_date: "2026-08-01", days: 3 },
        { policy_id: "p2", leave_type: "sick", status: "pending", start_date: "2026-07-20", days: 1 },
        { policy_id: "p1", leave_type: "paid", status: "approved", start_date: "2025-06-01", days: 5 },
      ],
      // Balance query: server-side filtered to approved + current year (2026) —
      // the 2025-06-01 approved row is correctly excluded here (prior year),
      // not because it fell off a recency cap.
      approvedRows: [{ policy_id: "p1", days: 3 }],
    };

    const res = await call();
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json).toMatchObject({
      id: "emp-target",
      name: "Priya Shah",
      role: "employee",
      department: "Engineering",
      phone: "+919000000001",
      personalEmail: "priya@gmail.com",
      whatsappOptIn: true,
      todayAttendance: { status: "clocked_in", clockIn: "2026-08-12T04:00:00Z", clockOut: null },
    });
    expect(json.leaveBalance).toEqual(
      expect.arrayContaining([
        { type: "paid", remaining: 15 },
        { type: "sick", remaining: 8 },
      ]),
    );
    expect(json.recentRequests).toEqual([
      { type: "paid", status: "approved", when: "2026-08-01" },
      { type: "sick", status: "pending", when: "2026-07-20" },
      { type: "paid", status: "approved", when: "2025-06-01" },
    ]);

    const body = JSON.stringify(json).toLowerCase();
    expect(body).not.toContain("salary");
    expect(body).not.toContain("ctc");
    expect(body).not.toContain("pan_number");
    expect(body).not.toContain("aadhar");
    expect(body).not.toContain("bank");
    const keys = Object.keys(json);
    expect(keys).not.toContain("salary");
    expect(keys).not.toContain("panNumber");
    expect(keys).not.toContain("aadharNumber");
  });

  it("todayAttendance is null when there's no attendance row today", async () => {
    tableConfig.attendance_records = { single: null };
    const res = await call();
    const json = await res.json();
    expect(json.todayAttendance).toBeNull();
  });

  it("todayAttendance is clocked_out once both punches exist", async () => {
    tableConfig.attendance_records = {
      single: { clock_in_at: "2026-08-12T04:00:00Z", clock_out_at: "2026-08-12T13:00:00Z" },
    };
    const res = await call();
    const json = await res.json();
    expect(json.todayAttendance).toEqual({
      status: "clocked_out",
      clockIn: "2026-08-12T04:00:00Z",
      clockOut: "2026-08-12T13:00:00Z",
    });
  });

  it("leaveBalance sums the FULL approved-current-year set, not just the most-recent-30 window (Finding 1)", async () => {
    tableConfig.leave_policies = { rows: [{ id: "p1", type: "paid", days_per_year: 40 }] };

    // "Recent requests" (route's second, limit-30 query): the newest 30
    // leave_requests rows for this employee, mixed statuses. Half are
    // approved — those alone would under-count balance usage if the balance
    // sum were (incorrectly) derived from this capped list.
    const recentThirty = Array.from({ length: 30 }, (_, i) => ({
      policy_id: "p1",
      leave_type: "paid",
      status: i % 2 === 0 ? ("approved" as const) : ("pending" as const),
      start_date: `2026-08-${String((i % 28) + 1).padStart(2, "0")}`,
      days: 1,
    }));
    const approvedWithinRecentWindow = recentThirty.filter((r) => r.status === "approved");

    // Older current-year APPROVED rows that exist in the DB but fall OUTSIDE
    // the most-recent-30 window (filed earlier in the year, since superseded
    // by 30+ newer requests). The unlimited balance query must still return
    // these — that's exactly what Finding 1 fixes.
    const olderApprovedOutsideWindow = [
      { policy_id: "p1", days: 2 },
      { policy_id: "p1", days: 3 },
    ];

    tableConfig.leave_requests = {
      rows: recentThirty,
      approvedRows: [
        ...approvedWithinRecentWindow.map((r) => ({ policy_id: r.policy_id, days: r.days })),
        ...olderApprovedOutsideWindow,
      ],
    };

    const res = await call();
    expect(res.status).toBe(200);
    const json = await res.json();

    const expectedUsed =
      approvedWithinRecentWindow.length * 1 /* 1 day each */ +
      olderApprovedOutsideWindow.reduce((sum, r) => sum + r.days, 0);
    expect(expectedUsed).toBeGreaterThan(15); // sanity: proves the older rows must be counted
    expect(json.leaveBalance).toEqual([{ type: "paid", remaining: 40 - expectedUsed }]);

    // The recent-requests list is unaffected — still shaped from the capped,
    // any-status, newest-first query (buildRecentRequests further slices to
    // its own display limit of 5).
    expect(json.recentRequests).toHaveLength(5);
  });
});
