import { describe, it, expect, vi, beforeEach } from "vitest";

// ── mutable mock state ────────────────────────────────────────────────────────
let clerkUserId: string | null = "clerk_1";
let currentUser: any = null;
let punchInsertError: { code?: string; message?: string } | null = null;
const recomputeSpy = vi.hoisted(() => vi.fn(async () => undefined));

// Per-table canned results. `single` serves maybeSingle()/single(); `rows`
// serves an awaited (thenable) chain and .limit(); `count` serves head:count.
const tableConfig: Record<string, { single?: any; rows?: any[]; count?: number }> = {};

function resetTableConfig() {
  tableConfig.employees = {
    single: {
      id: "emp-1",
      first_name: "Priya",
      last_name: "Sharma",
      email: "priya@acme.in",
      phone: null,
      employment_type: "full_time",
      department_id: null,
      status: "active",
    },
    rows: [{ org_id: "org-1", role: "employee", organizations: { id: "org-1", name: "Acme" } }],
  };
  tableConfig.attendance_records = {
    single: { clock_in_at: null, clock_out_at: null, total_minutes: null },
    rows: [],
  };
  tableConfig.shift_assignments = { rows: [] };
  tableConfig.leave_policies = {
    rows: [{ id: "p1", name: "Annual Leave", type: "paid", days_per_year: 21 }],
  };
  tableConfig.leave_requests = { rows: [], count: 0 };
  tableConfig.holidays = { rows: [] };
  tableConfig.attendance_punch_events = { rows: [], count: 0 };
  tableConfig.week_off_policy = { single: null };
  tableConfig.employee_week_off_override = { single: null };
  tableConfig.department_week_off_override = { single: null };
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
    insert: () => Promise.resolve({ data: null, error: punchInsertError }),
    eq: () => chain,
    neq: () => chain,
    gte: () => chain,
    lte: () => chain,
    lt: () => chain,
    order: () => chain,
    limit: () => Promise.resolve(awaitResult),
    maybeSingle: () => Promise.resolve({ data: cfg.single ?? null, error: null }),
    single: () => Promise.resolve({ data: cfg.single ?? null, error: null }),
    then: (resolve: (v: any) => any) => resolve(awaitResult),
  };
  return chain;
}

// ── module mocks (registered before importing the routes) ─────────────────────
vi.mock("@clerk/nextjs/server", () => ({ auth: () => ({ userId: clerkUserId }) }));
vi.mock("@/lib/current-user", () => ({ getCurrentUser: vi.fn(async () => currentUser) }));
vi.mock("@/lib/supabase/server", () => ({
  createAdminSupabase: () => ({ from: (t: string) => makeChain(t) }),
}));
vi.mock("@/lib/attendance/adms-ingest", () => ({ recomputeAttendanceDay: recomputeSpy }));

import { GET as meGET } from "@/app/api/mobile/me/route";
import { GET as homeGET } from "@/app/api/mobile/home/route";
import { GET as attendanceGET } from "@/app/api/mobile/attendance/route";
import { POST as punchPOST } from "@/app/api/mobile/attendance/punch/route";

function req(url = "http://localhost/api/mobile/x", init?: RequestInit) {
  return new Request(url, init) as any;
}

const VALID_USER = {
  orgId: "org-1",
  orgName: "Acme",
  role: "employee",
  plan: "business",
  employeeId: "emp-1",
  attendanceEnabled: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  clerkUserId = "clerk_1";
  currentUser = { ...VALID_USER };
  punchInsertError = null;
  resetTableConfig();
});

// ── shared auth-contract assertions across all four routes ────────────────────
const routes = [
  { name: "GET /api/mobile/me", call: () => meGET(req()) },
  { name: "GET /api/mobile/home", call: () => homeGET(req()) },
  { name: "GET /api/mobile/attendance", call: () => attendanceGET(req("http://localhost/api/mobile/attendance?month=2026-07")) },
  {
    name: "POST /api/mobile/attendance/punch",
    call: () =>
      punchPOST(
        req("http://localhost/api/mobile/attendance/punch", {
          method: "POST",
          body: JSON.stringify({
            clientEventId: "b3f1c2de-0000-4000-8000-000000000001",
            punchedAt: new Date().toISOString(),
          }),
        }),
      ),
  },
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

// ── 200 shape assertions ──────────────────────────────────────────────────────
describe("GET /api/mobile/me (200)", () => {
  it("returns the MobileMeResponse contract", async () => {
    const res = await meGET(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.orgId).toBe("org-1");
    expect(json.employee.firstName).toBe("Priya");
    expect(Array.isArray(json.memberships)).toBe(true);
  });
});

describe("GET /api/mobile/home (200)", () => {
  it("returns the composed home payload shape", async () => {
    const res = await homeGET(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.today).toBeDefined();
    expect(json.today.isClockedIn).toBe(false);
    expect(json.leave.balances[0]).toMatchObject({ policyId: "p1", total: 21, used: 0, remaining: 21 });
    expect(Array.isArray(json.nextHolidays)).toBe(true);
    expect(json.pending).toEqual({ leaveRequests: 0, regularizations: 0 });
  });
});

describe("GET /api/mobile/attendance (200)", () => {
  it("returns the month calendar payload shape", async () => {
    const res = await attendanceGET(req("http://localhost/api/mobile/attendance?month=2026-07"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.month).toBe("2026-07");
    expect(Array.isArray(json.days)).toBe(true);
    expect(json.days.length).toBe(31);
    expect(Array.isArray(json.details)).toBe(true);
  });

  it("rejects a malformed month with 400 invalid_month", async () => {
    const res = await attendanceGET(req("http://localhost/api/mobile/attendance?month=2026-13"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_month");
  });
});

describe("POST /api/mobile/attendance/punch (200 + validation)", () => {
  const goodBody = () =>
    JSON.stringify({
      clientEventId: "b3f1c2de-0000-4000-8000-000000000001",
      punchedAt: new Date().toISOString(),
    });

  it("records a punch, recomputes the day, and returns fresh today-status", async () => {
    const res = await punchPOST(
      req("http://localhost/api/mobile/attendance/punch", { method: "POST", body: goodBody() }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.today).toBeDefined();
    expect(recomputeSpy).toHaveBeenCalledTimes(1);
  });

  it("treats a 23505 client_event_id conflict as an idempotent success", async () => {
    punchInsertError = { code: "23505", message: "duplicate key" };
    const res = await punchPOST(
      req("http://localhost/api/mobile/attendance/punch", { method: "POST", body: goodBody() }),
    );
    expect(res.status).toBe(200);
    expect(recomputeSpy).toHaveBeenCalledTimes(1); // still recomputes on replay
  });

  it("rejects a real insert error with 500", async () => {
    punchInsertError = { code: "23503", message: "fk violation" };
    const res = await punchPOST(
      req("http://localhost/api/mobile/attendance/punch", { method: "POST", body: goodBody() }),
    );
    expect(res.status).toBe(500);
    expect(recomputeSpy).not.toHaveBeenCalled();
  });

  it("rejects a punch outside the ±24h clock-skew window with 400", async () => {
    const res = await punchPOST(
      req("http://localhost/api/mobile/attendance/punch", {
        method: "POST",
        body: JSON.stringify({
          clientEventId: "b3f1c2de-0000-4000-8000-000000000001",
          punchedAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        }),
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("clock_skew");
  });

  it("rejects a malformed body with 400", async () => {
    const res = await punchPOST(
      req("http://localhost/api/mobile/attendance/punch", {
        method: "POST",
        body: JSON.stringify({ clientEventId: "nope", punchedAt: "not-a-date" }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
