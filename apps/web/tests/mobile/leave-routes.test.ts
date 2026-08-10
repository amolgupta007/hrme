import { describe, it, expect, vi, beforeEach } from "vitest";

// ── mutable mock state ────────────────────────────────────────────────────────
let clerkUserId: string | null = "clerk_1";
let currentUser: any = null;

// Per-table canned results. `single` serves maybeSingle()/single(); `rows`
// serves an awaited (thenable) chain and .limit(); `count` serves head:count.
const tableConfig: Record<string, { single?: any; rows?: any[]; count?: number }> = {};
// Records every `.in(col, vals)` filter so tests can assert scope wiring.
let inCalls: Array<[string, any]> = [];

function resetTableConfig() {
  tableConfig.leave_policies = {
    rows: [{ id: "p1", name: "Annual Leave", type: "paid", days_per_year: 21 }],
  };
  tableConfig.leave_requests = { rows: [], count: 0 };
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
    insert: () => Promise.resolve({ data: null, error: null }),
    eq: () => chain,
    neq: () => chain,
    gte: () => chain,
    lte: () => chain,
    lt: () => chain,
    in: (col: string, vals: any) => {
      inCalls.push([col, vals]);
      return chain;
    },
    order: () => chain,
    limit: () => Promise.resolve(awaitResult),
    maybeSingle: () => Promise.resolve({ data: cfg.single ?? null, error: null }),
    single: () => Promise.resolve({ data: cfg.single ?? null, error: null }),
    then: (resolve: (v: any) => any) => resolve(awaitResult),
  };
  return chain;
}

// ── action + helper mocks (configurable) ──────────────────────────────────────
const requestLeaveMock = vi.hoisted(() => vi.fn());
const cancelLeaveMock = vi.hoisted(() => vi.fn());
const approveLeaveMock = vi.hoisted(() => vi.fn());
const rejectLeaveMock = vi.hoisted(() => vi.fn());
const scopeMock = vi.hoisted(() => vi.fn(async (_org: string, _me: string) => ["emp-2", "emp-1"]));
const directReportsMock = vi.hoisted(() => vi.fn(async (_org: string, _me: string) => ["emp-2"]));

vi.mock("@clerk/nextjs/server", () => ({ auth: () => ({ userId: clerkUserId }) }));
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: vi.fn(async () => currentUser),
  isAdmin: (r: string) => r === "owner" || r === "admin",
  isManagerOrAbove: (r: string) => r === "owner" || r === "admin" || r === "manager",
}));
vi.mock("@/lib/supabase/server", () => ({
  createAdminSupabase: () => ({ from: (t: string) => makeChain(t) }),
}));
vi.mock("@/actions/leaves", () => ({
  requestLeave: requestLeaveMock,
  cancelLeave: cancelLeaveMock,
  approveLeave: approveLeaveMock,
  rejectLeave: rejectLeaveMock,
}));
vi.mock("@/lib/attendance/manager-scope", () => ({ getManagerScopedEmployeeIds: scopeMock }));
vi.mock("@/lib/managers", () => ({
  getDirectReportIds: directReportsMock,
  managerIdsOf: (e: any) => [e?.reporting_manager_id, e?.reporting_manager_2_id].filter(Boolean),
  isManagerOfEmployee: () => false,
}));

import { GET as leaveGET } from "@/app/api/mobile/leave/route";
import { POST as applyPOST } from "@/app/api/mobile/leave/apply/route";
import { POST as cancelPOST } from "@/app/api/mobile/leave/cancel/route";
import { GET as approvalsGET } from "@/app/api/mobile/leave/approvals/route";
import { POST as decidePOST } from "@/app/api/mobile/leave/decide/route";

function req(url = "http://localhost/api/mobile/leave", init?: RequestInit) {
  return new Request(url, init) as any;
}
function post(url: string, bodyObj: unknown) {
  return req(url, { method: "POST", body: JSON.stringify(bodyObj) });
}

const EMPLOYEE = { orgId: "org-1", orgName: "Acme", role: "employee", plan: "business", employeeId: "emp-1" };
const MANAGER = { ...EMPLOYEE, role: "manager" };
const ADMIN = { ...EMPLOYEE, role: "admin" };

beforeEach(() => {
  vi.clearAllMocks();
  clerkUserId = "clerk_1";
  currentUser = { ...EMPLOYEE };
  inCalls = [];
  resetTableConfig();
  requestLeaveMock.mockResolvedValue({ success: true, data: { id: "lr-new" } });
  cancelLeaveMock.mockResolvedValue({ success: true, data: undefined });
  approveLeaveMock.mockResolvedValue({ success: true, data: undefined });
  rejectLeaveMock.mockResolvedValue({ success: true, data: undefined });
  scopeMock.mockResolvedValue(["emp-2", "emp-1"]);
  directReportsMock.mockResolvedValue(["emp-2"]);
});

// ── shared auth contract across all five routes ───────────────────────────────
const validApply = { policyId: "b3f1c2de-0000-4000-8000-000000000001", startDate: "2026-08-20", endDate: "2026-08-20" };
const routes = [
  { name: "GET /leave", call: () => leaveGET(req()) },
  { name: "POST /leave/apply", call: () => applyPOST(post("http://localhost/api/mobile/leave/apply", validApply)) },
  { name: "POST /leave/cancel", call: () => cancelPOST(post("http://localhost/api/mobile/leave/cancel", { requestId: "b3f1c2de-0000-4000-8000-000000000009" })) },
  { name: "GET /leave/approvals", call: () => approvalsGET(req("http://localhost/api/mobile/leave/approvals")) },
  { name: "POST /leave/decide", call: () => decidePOST(post("http://localhost/api/mobile/leave/decide", { requestId: "b3f1c2de-0000-4000-8000-000000000009", decision: "approve" })) },
];

for (const r of routes) {
  describe(r.name, () => {
    it("returns 401 unauthenticated when there is no Clerk session", async () => {
      clerkUserId = null;
      const res = await r.call();
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe("unauthenticated");
    });
    it("returns 403 no_membership when the user has no org membership", async () => {
      currentUser = null;
      const res = await r.call();
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe("no_membership");
    });
  });
}

// ── GET /leave ────────────────────────────────────────────────────────────────
describe("GET /api/mobile/leave (200)", () => {
  it("returns balances + myRequests shape", async () => {
    const res = await leaveGET(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.balances[0]).toMatchObject({ policyId: "p1", total: 21, used: 0, remaining: 21 });
    expect(Array.isArray(json.myRequests)).toBe(true);
  });
});

// ── POST /leave/apply ─────────────────────────────────────────────────────────
describe("POST /api/mobile/leave/apply", () => {
  it("derives days, calls requestLeave for self, returns {id}", async () => {
    const res = await applyPOST(post("http://localhost/api/mobile/leave/apply", validApply));
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe("lr-new");
    expect(requestLeaveMock).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: "emp-1", days: 1, exceedsBalance: false }),
      null, // no x-org-id header on the test request → hint is null
    );
  });

  it("passes an overlap/balance validation error through verbatim as 400", async () => {
    requestLeaveMock.mockResolvedValue({
      success: false,
      error: "Overlaps an existing leave request (2026-08-19 to 2026-08-21)",
    });
    const res = await applyPOST(post("http://localhost/api/mobile/leave/apply", validApply));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Overlaps an existing leave request (2026-08-19 to 2026-08-21)");
  });

  it("rejects a zero-day (both half-day chips on a single day) before the action", async () => {
    const res = await applyPOST(
      post("http://localhost/api/mobile/leave/apply", { ...validApply, startHalfDay: true, endHalfDay: true }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Leave must be at least half a day");
    expect(requestLeaveMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed body with 400", async () => {
    const res = await applyPOST(post("http://localhost/api/mobile/leave/apply", { policyId: "nope" }));
    expect(res.status).toBe(400);
    expect(requestLeaveMock).not.toHaveBeenCalled();
  });
});

// ── POST /leave/cancel ────────────────────────────────────────────────────────
describe("POST /api/mobile/leave/cancel", () => {
  const body = { requestId: "b3f1c2de-0000-4000-8000-000000000009" };
  it("delegates to cancelLeave and returns {ok:true}", async () => {
    const res = await cancelPOST(post("http://localhost/api/mobile/leave/cancel", body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(cancelLeaveMock).toHaveBeenCalledWith(body.requestId, null);
  });
  it("passes the action's error through as 400", async () => {
    cancelLeaveMock.mockResolvedValue({ success: false, error: "Unauthorized" });
    const res = await cancelPOST(post("http://localhost/api/mobile/leave/cancel", body));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Unauthorized");
  });
});

// ── GET /leave/approvals ──────────────────────────────────────────────────────
describe("GET /api/mobile/leave/approvals", () => {
  it("returns an empty list (NOT 403) for an employee role", async () => {
    currentUser = { ...EMPLOYEE };
    const res = await approvalsGET(req("http://localhost/api/mobile/leave/approvals"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ requests: [], historyCount: 0 });
    expect(scopeMock).not.toHaveBeenCalled();
  });

  it("scopes pending requests to getManagerScopedEmployeeIds (self excluded) and shapes them", async () => {
    currentUser = { ...MANAGER };
    tableConfig.leave_requests = {
      rows: [
        {
          id: "lr-1",
          employee_id: "emp-2",
          policy_id: "p1",
          start_date: "2026-08-20",
          end_date: "2026-08-21",
          days: 2,
          reason: "trip",
          start_half_day: false,
          end_half_day: false,
          status: "approved",
          leave_policies: { name: "Annual Leave", type: "paid", days_per_year: 21 },
          employees: { first_name: "Ravi", last_name: "Kumar", departments: { name: "Sales" } },
        },
      ],
      count: 3,
    };
    const res = await approvalsGET(req("http://localhost/api/mobile/leave/approvals"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(scopeMock).toHaveBeenCalledWith("org-1", "emp-1");
    // self (emp-1) filtered out of scope → query filtered to ["emp-2"]
    expect(inCalls).toContainEqual(["employee_id", ["emp-2"]]);
    expect(json.requests[0]).toMatchObject({
      requestId: "lr-1",
      requesterName: "Ravi Kumar",
      requesterInitials: "RK",
      department: "Sales",
      isDirectReport: true,
      balanceAfter: 17, // remaining 21−2=19, minus this 2-day request
      teamOverlap: null, // requester's own approved leave is not a peer collision
    });
    expect(json.historyCount).toBe(3);
  });

  it("returns empty when a manager scopes to nobody", async () => {
    currentUser = { ...MANAGER };
    scopeMock.mockResolvedValue(["emp-1"]); // only self → filtered to []
    const res = await approvalsGET(req("http://localhost/api/mobile/leave/approvals"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ requests: [], historyCount: 0 });
  });
});

// ── POST /leave/decide (scope guard is the critical case) ─────────────────────
describe("POST /api/mobile/leave/decide", () => {
  const body = (over?: Record<string, unknown>) => ({
    requestId: "b3f1c2de-0000-4000-8000-000000000009",
    decision: "approve",
    ...over,
  });

  it("403 forbidden for an employee role (never reaches the action)", async () => {
    currentUser = { ...EMPLOYEE };
    const res = await decidePOST(post("http://localhost/api/mobile/leave/decide", body()));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("forbidden");
    expect(approveLeaveMock).not.toHaveBeenCalled();
  });

  it("403 forbidden when the request's employee is OUTSIDE the manager's scope", async () => {
    currentUser = { ...MANAGER };
    tableConfig.leave_requests = { single: { id: "lr-x", employee_id: "emp-9", status: "pending" } };
    scopeMock.mockResolvedValue(["emp-2"]); // emp-9 not in scope
    const res = await decidePOST(post("http://localhost/api/mobile/leave/decide", body()));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("forbidden");
    expect(approveLeaveMock).not.toHaveBeenCalled();
  });

  it("approves an in-scope request and returns {ok:true}", async () => {
    currentUser = { ...MANAGER };
    tableConfig.leave_requests = { single: { id: "lr-2", employee_id: "emp-2", status: "pending" } };
    scopeMock.mockResolvedValue(["emp-2"]);
    const res = await decidePOST(post("http://localhost/api/mobile/leave/decide", body({ comment: "ok" })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(approveLeaveMock).toHaveBeenCalledWith("b3f1c2de-0000-4000-8000-000000000009", "ok", null);
    expect(rejectLeaveMock).not.toHaveBeenCalled();
  });

  it("rejects (decision:'reject') via rejectLeave", async () => {
    currentUser = { ...MANAGER };
    tableConfig.leave_requests = { single: { id: "lr-2", employee_id: "emp-2", status: "pending" } };
    scopeMock.mockResolvedValue(["emp-2"]);
    const res = await decidePOST(post("http://localhost/api/mobile/leave/decide", body({ decision: "reject" })));
    expect(res.status).toBe(200);
    expect(rejectLeaveMock).toHaveBeenCalled();
  });

  it("admin decides any request without a scope check", async () => {
    currentUser = { ...ADMIN };
    tableConfig.leave_requests = { single: { id: "lr-3", employee_id: "emp-77", status: "pending" } };
    const res = await decidePOST(post("http://localhost/api/mobile/leave/decide", body()));
    expect(res.status).toBe(200);
    expect(scopeMock).not.toHaveBeenCalled();
    expect(approveLeaveMock).toHaveBeenCalled();
  });

  it("404 not_found when the request is not in the caller's org", async () => {
    currentUser = { ...MANAGER };
    tableConfig.leave_requests = { single: null };
    const res = await decidePOST(post("http://localhost/api/mobile/leave/decide", body()));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_found");
  });
});
