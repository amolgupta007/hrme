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
import { POST as regularizePOST } from "@/app/api/mobile/attendance/regularize/route";

function req(url = "http://localhost/api/mobile/x", init?: RequestInit) {
  return new Request(url, init) as any;
}

/** IST calendar date `n` days before today (YYYY-MM-DD). */
function istDaysAgo(n: number): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000 - n * 86400 * 1000).toISOString().slice(0, 10);
}

function regularizeBody(overrides?: Record<string, unknown>) {
  const date = istDaysAgo(2);
  return JSON.stringify({
    date,
    proposedIn: `${date}T09:30:00+05:30`,
    proposedOut: `${date}T18:00:00+05:30`,
    reason: "Forgot to punch in",
    ...overrides,
  });
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
  {
    name: "POST /api/mobile/attendance/regularize",
    call: () =>
      regularizePOST(
        req("http://localhost/api/mobile/attendance/regularize", {
          method: "POST",
          body: regularizeBody(),
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

describe("POST /api/mobile/attendance/regularize (200 + validation)", () => {
  const post = (body: string) =>
    regularizePOST(
      req("http://localhost/api/mobile/attendance/regularize", { method: "POST", body }),
    );

  it("records pending in+out events, recomputes the day, and returns eventsCreated=2", async () => {
    const res = await post(regularizeBody());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, eventsCreated: 2 });
    expect(recomputeSpy).toHaveBeenCalledTimes(1);
    expect(recomputeSpy).toHaveBeenCalledWith(expect.anything(), "org-1", "emp-1", istDaysAgo(2));
  });

  it("returns eventsCreated=1 for an in-only submission", async () => {
    const res = await post(regularizeBody({ proposedOut: null }));
    expect(res.status).toBe(200);
    expect((await res.json()).eventsCreated).toBe(1);
  });

  it("rejects today's date with 400 date_not_past", async () => {
    const today = istDaysAgo(0);
    const res = await post(
      regularizeBody({
        date: today,
        proposedIn: `${today}T09:30:00+05:30`,
        proposedOut: null,
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("date_not_past");
    expect(recomputeSpy).not.toHaveBeenCalled();
  });

  it("rejects a date before employment with 400 before_employment", async () => {
    tableConfig.employees.single.date_of_joining = istDaysAgo(1);
    const res = await post(regularizeBody());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("before_employment");
  });

  it("rejects out at-or-before in with 400 out_before_in", async () => {
    const date = istDaysAgo(2);
    const res = await post(
      regularizeBody({
        proposedIn: `${date}T18:00:00+05:30`,
        proposedOut: `${date}T09:30:00+05:30`,
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("out_before_in");
  });

  it("rejects a proposedIn on a different IST day with 400 in_not_on_date", async () => {
    const date = istDaysAgo(2);
    const other = istDaysAgo(3);
    const res = await post(
      regularizeBody({ proposedIn: `${other}T09:30:00+05:30`, proposedOut: null }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("in_not_on_date");
    void date;
  });

  it("rejects a missing reason with 400", async () => {
    const res = await post(regularizeBody({ reason: "" }));
    expect(res.status).toBe(400);
    expect(recomputeSpy).not.toHaveBeenCalled();
  });

  it("returns 403 attendance_disabled when the org has attendance off", async () => {
    currentUser = { ...VALID_USER, attendanceEnabled: false };
    const res = await post(regularizeBody());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("attendance_disabled");
  });

  it("returns 403 inactive_employee for a terminated employee", async () => {
    tableConfig.employees.single.status = "terminated";
    const res = await post(regularizeBody());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("inactive_employee");
  });

  it("returns 409 duplicate_time on a unique-violation (23505) — e.g. resubmit after rejection", async () => {
    punchInsertError = { code: "23505", message: "duplicate key value violates uq_punch_events_dedupe" };
    const res = await post(regularizeBody());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("duplicate_time");
    // The 2-row insert is one atomic statement — nothing persisted, so no
    // recompute (and no partial IN-only state to clean up).
    expect(recomputeSpy).not.toHaveBeenCalled();
  });

  it("returns a generic 500 on a real insert error without leaking the DB message", async () => {
    punchInsertError = { code: "23503", message: "fk violation on attendance_punch_events" };
    const res = await post(regularizeBody());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("insert_failed");
    expect(JSON.stringify(json)).not.toContain("fk violation");
    expect(recomputeSpy).not.toHaveBeenCalled();
  });
});

describe("GET /api/mobile/attendance — pendingRegularizationDates", () => {
  it("lists IST dates that carry a pending punch event", async () => {
    tableConfig.attendance_punch_events = {
      rows: [
        { punched_at: "2026-07-10T04:00:00Z", status: "pending" },
        { punched_at: "2026-07-11T04:00:00Z", status: "approved" },
      ],
      count: 1,
    };
    const res = await attendanceGET(req("http://localhost/api/mobile/attendance?month=2026-07"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.pendingRegularizationDates).toEqual(["2026-07-10"]);
  });
});
